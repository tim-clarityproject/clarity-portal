import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Trash2, GripVertical } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import HomeHeader from '../components/HomeHeader';

export default function PersonalOperatingPlanEdit() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
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
    if (window.confirm('Delete this strategy and all its tactics?')) {
      setStrategies(strategies.filter((_, i) => i !== index));
    }
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
    if (window.confirm('Delete this tactic?')) {
      const updated = [...strategies];
      updated[strategyIndex].tactics = updated[strategyIndex].tactics.filter((_, i) => i !== tacticIndex);
      setStrategies(updated);
    }
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

      // Sync mission title to profiles.personal_goal for consistency
      await supabase
        .from('profiles')
        .update({ personal_goal: missionTitle })
        .eq('id', user.id);

      // Delete removed strategies
      for (const strategy of strategies) {
        if (!strategy.isNew && strategy.id) {
          const exists = await supabase
            .from('strategies')
            .select('id')
            .eq('id', strategy.id)
            .single();

          if (exists.data && strategies.find(s => s.id === strategy.id) === undefined) {
            await supabase.from('strategies').delete().eq('id', strategy.id);
          }
        }
      }

      // Upsert strategies
      for (let sIndex = 0; sIndex < strategies.length; sIndex++) {
        const strategy = strategies[sIndex];

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
          strategies[sIndex].id = newStrategy.id;
        } else {
          await supabase
            .from('strategies')
            .update({
              name: strategy.name,
              description: strategy.description,
              sort_order: sIndex
            })
            .eq('id', strategy.id);
        }

        // Upsert tactics
        for (let tIndex = 0; tIndex < strategy.tactics.length; tIndex++) {
          const tactic = strategy.tactics[tIndex];

          if (tactic.isNew) {
            await supabase.from('tactics').insert([{
              strategy_id: strategies[sIndex].id,
              action: tactic.action,
              name: tactic.action,
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
                name: tactic.action,
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

      navigate('/personal-operating-plan');
    } catch (error) {
      console.error('Error saving plan:', error);
      alert('Failed to save plan');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', paddingTop: 'var(--header-height)', backgroundColor: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#999' }}>Loading...</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', paddingTop: 'var(--header-height)', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader />

      <style>{`
        .edit-page-container {
          padding: 64px 32px;
        }
        @media (max-width: 768px) {
          .edit-page-container {
            padding: 32px 16px;
          }
        }
        input[type="text"]:focus,
        textarea:focus,
        select:focus {
          outline: none;
          border-color: #F08571;
          box-shadow: 0 0 0 3px rgba(240, 133, 113, 0.1);
        }
      `}</style>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%' }} className="edit-page-container">

        {/* PAGE TITLE */}
        <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#333', margin: '0 0 48px 0', lineHeight: '1.2' }}>
          Shape Your Personal Operating Plan
        </h1>

        {/* MISSION STATEMENT SECTION */}
        <div style={{ marginBottom: '48px' }}>
          <label style={{ display: 'block', fontSize: '11px', color: '#999', margin: '0 0 12px 0', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Your Mission Statement
          </label>
          <textarea
            value={missionTitle}
            onChange={(e) => setMissionTitle(e.target.value)}
            placeholder="Define your mission in clear, compelling language..."
            style={{
              width: '100%',
              padding: '16px',
              fontSize: '16px',
              fontWeight: '500',
              border: '1px solid #e5e5e5',
              borderRadius: '8px',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
              minHeight: '100px',
              lineHeight: '1.6',
              resize: 'vertical',
              transition: 'border-color 0.2s, box-shadow 0.2s'
            }}
          />
          <p style={{ fontSize: '12px', color: '#999', margin: '8px 0 0 0' }}>This is the anchor for everything below.</p>
        </div>

        {/* STRATEGIES SECTION */}
        <div style={{ marginBottom: '48px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#333', margin: '0 0 24px 0', paddingBottom: '12px', borderBottom: '1px solid #e5e5e5' }}>
            Your Strategies
          </h2>

          {strategies.length === 0 ? (
            <div style={{ padding: '32px', backgroundColor: '#f9f9f9', borderRadius: '8px', border: '1px dashed #e5e5e5', textAlign: 'center' }}>
              <p style={{ color: '#999', fontSize: '14px', margin: 0 }}>No strategies yet. Add one to get started.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '24px' }}>
              {strategies.map((strategy, sIndex) => (
                <div
                  key={strategy.id}
                  style={{
                    backgroundColor: 'white',
                    border: '1px solid #e5e5e5',
                    borderRadius: '8px',
                    borderLeft: '4px solid #F08571',
                    padding: '20px',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.08)'}
                  onMouseLeave={(e) => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.06)'}
                >
                  {/* Strategy Header with Controls */}
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', gap: '4px', opacity: 0.5 }}>
                      <GripVertical size={16} style={{ color: '#999' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <input
                        type="text"
                        value={strategy.name}
                        onChange={(e) => updateStrategy(sIndex, 'name', e.target.value)}
                        placeholder="Strategy name"
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          fontSize: '16px',
                          fontWeight: '600',
                          border: '1px solid #e5e5e5',
                          borderRadius: '6px',
                          fontFamily: 'inherit',
                          boxSizing: 'border-box',
                          transition: 'border-color 0.2s, box-shadow 0.2s'
                        }}
                      />
                    </div>
                    <button
                      onClick={() => deleteStrategy(sIndex)}
                      style={{
                        padding: '8px 10px',
                        backgroundColor: 'transparent',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        color: '#F08571',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#fff0ee';
                        e.currentTarget.style.color = '#e07560';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                        e.currentTarget.style.color = '#F08571';
                      }}
                      title="Delete strategy"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>

                  {/* Strategy Description */}
                  <textarea
                    value={strategy.description || ''}
                    onChange={(e) => updateStrategy(sIndex, 'description', e.target.value)}
                    placeholder="Why does this matter? How does it support your mission?"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      fontSize: '13px',
                      border: '1px solid #e5e5e5',
                      borderRadius: '6px',
                      fontFamily: 'inherit',
                      boxSizing: 'border-box',
                      minHeight: '70px',
                      color: '#666',
                      marginBottom: '16px',
                      resize: 'vertical',
                      transition: 'border-color 0.2s, box-shadow 0.2s'
                    }}
                  />

                  {/* TACTICS SECTION */}
                  <div style={{ paddingTop: '16px', borderTop: '1px solid #f0f0f0' }}>
                    <p style={{ fontSize: '11px', fontWeight: '600', color: '#999', margin: '0 0 12px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Tactics
                    </p>

                    {strategy.tactics.length === 0 ? (
                      <p style={{ fontSize: '13px', color: '#999', margin: '0 0 12px 0', fontStyle: 'italic' }}>No tactics yet. Add one below.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '12px' }}>
                        {strategy.tactics.map((tactic, tIndex) => (
                          <div
                            key={tactic.id}
                            style={{
                              display: 'flex',
                              gap: '8px',
                              padding: '12px',
                              backgroundColor: '#fafafa',
                              borderRadius: '6px',
                              alignItems: 'flex-start',
                              border: '1px solid #f0f0f0',
                            }}
                          >
                            <div style={{ display: 'flex', opacity: 0.3, paddingTop: '6px' }}>
                              <GripVertical size={14} style={{ color: '#999' }} />
                            </div>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              <input
                                type="text"
                                value={tactic.action}
                                onChange={(e) => updateTactic(sIndex, tIndex, 'action', e.target.value)}
                                placeholder="What's the specific action?"
                                style={{
                                  padding: '8px 10px',
                                  fontSize: '13px',
                                  border: '1px solid #e5e5e5',
                                  borderRadius: '4px',
                                  fontFamily: 'inherit',
                                  boxSizing: 'border-box',
                                  transition: 'border-color 0.2s'
                                }}
                              />
                              <select
                                value={tactic.type}
                                onChange={(e) => updateTactic(sIndex, tIndex, 'type', e.target.value)}
                                style={{
                                  padding: '6px 10px',
                                  fontSize: '12px',
                                  border: '1px solid #e5e5e5',
                                  borderRadius: '4px',
                                  backgroundColor: 'white',
                                  color: '#666',
                                  boxSizing: 'border-box',
                                  transition: 'border-color 0.2s'
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
                                      padding: '6px 10px',
                                      fontSize: '12px',
                                      border: '1px solid #e5e5e5',
                                      borderRadius: '4px',
                                      boxSizing: 'border-box'
                                    }}
                                  />
                                  <input
                                    type="text"
                                    value={tactic.unit || ''}
                                    onChange={(e) => updateTactic(sIndex, tIndex, 'unit', e.target.value)}
                                    placeholder="Unit (e.g., reps)"
                                    style={{
                                      padding: '6px 10px',
                                      fontSize: '12px',
                                      border: '1px solid #e5e5e5',
                                      borderRadius: '4px',
                                      boxSizing: 'border-box'
                                    }}
                                  />
                                </div>
                              )}
                            </div>
                            <button
                              onClick={() => deleteTactic(sIndex, tIndex)}
                              style={{
                                padding: '6px 8px',
                                backgroundColor: 'transparent',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                color: '#F08571',
                                transition: 'all 0.2s',
                                display: 'flex',
                                alignItems: 'center',
                                marginTop: '2px'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = '#fff0ee';
                                e.currentTarget.style.color = '#e07560';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'transparent';
                                e.currentTarget.style.color = '#F08571';
                              }}
                              title="Delete tactic"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add Tactic Button */}
                    <button
                      onClick={() => addTactic(sIndex)}
                      style={{
                        width: '100%',
                        padding: '10px',
                        backgroundColor: 'white',
                        border: '1px dashed #e5e5e5',
                        borderRadius: '4px',
                        color: '#999',
                        fontSize: '12px',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        fontWeight: '500'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#f9f9f9';
                        e.currentTarget.style.borderColor = '#F08571';
                        e.currentTarget.style.color = '#F08571';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'white';
                        e.currentTarget.style.borderColor = '#e5e5e5';
                        e.currentTarget.style.color = '#999';
                      }}
                    >
                      + Add tactic
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add Strategy Button */}
          <button
            onClick={addStrategy}
            style={{
              width: '100%',
              padding: '14px 24px',
              backgroundColor: 'white',
              border: '2px dashed #e5e5e5',
              borderRadius: '8px',
              color: '#666',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#f9f9f9';
              e.currentTarget.style.borderColor = '#F08571';
              e.currentTarget.style.color = '#F08571';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'white';
              e.currentTarget.style.borderColor = '#e5e5e5';
              e.currentTarget.style.color = '#666';
            }}
          >
            + Add Strategy
          </button>
        </div>

        {/* ACTION BUTTONS */}
        <div style={{ display: 'flex', gap: '12px', paddingTop: '24px', borderTop: '1px solid #e5e5e5' }}>
          <button
            onClick={() => navigate('/personal-operating-plan')}
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
            Cancel
          </button>
          <button
            onClick={savePlan}
            disabled={isSaving}
            style={{
              flex: 1,
              padding: '14px 24px',
              backgroundColor: isSaving ? '#ccc' : '#F08571',
              border: 'none',
              borderRadius: '8px',
              color: 'white',
              fontWeight: '600',
              cursor: isSaving ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              if (!isSaving) {
                e.currentTarget.style.backgroundColor = '#e07560';
              }
            }}
            onMouseLeave={(e) => {
              if (!isSaving) {
                e.currentTarget.style.backgroundColor = '#F08571';
              }
            }}
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>

      </div>
    </div>
  );
}
