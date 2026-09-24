import { useState, useContext, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { clearProgress } from '../lib/saveProgress';
import HomeHeader from '../components/HomeHeader';
import { useAutoExpandTextarea } from '../hooks/useAutoExpandTextarea';

export default function StopDoingAudit() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const decisionId = location.state?.decisionId;

  const [items, setItems] = useState([{ id: 1, activity: '', timePerWeek: '', action: '' }]);
  const [nextId, setNextId] = useState(2);
  const [firstAction, setFirstAction] = useState('');
  const [timeUse, setTimeUse] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const isEditMode = Boolean(decisionId);
  const refFirstAction = useRef(null);
  const refTimeUse = useRef(null);
  useAutoExpandTextarea(refFirstAction, firstAction);
  useAutoExpandTextarea(refTimeUse, timeUse);

  useEffect(() => {
    if (decisionId && user) {
      loadAudit();
    }
  }, [decisionId, user]);

  const loadAudit = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('decisions')
        .select('*')
        .eq('id', decisionId)
        .eq('user_id', user.id)
        .single();

      if (data && data.form_data) {
        const formData = data.form_data;
        if (formData.items && formData.items.length > 0) {
          setItems(formData.items);
          const maxId = Math.max(...formData.items.map(item => item.id || 0));
          setNextId(maxId + 1);
        }
        if (formData.firstAction) {
          setFirstAction(formData.firstAction);
        }
        if (formData.timeUse) {
          setTimeUse(formData.timeUse);
        }
      }
    } catch (error) {
      console.error('Error loading audit:', error);
    }
  };

  const handleAddItem = () => {
    setItems([...items, { id: nextId, activity: '', timePerWeek: '', action: '' }]);
    setNextId(nextId + 1);
  };

  const handleRemoveItem = (id) => {
    if (items.length > 1) {
      setItems(items.filter(item => item.id !== id));
    }
  };

  const handleItemChange = (id, field, value) => {
    setItems(items.map(item =>
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  const getTotalTime = () => {
    return items.reduce((total, item) => {
      const time = parseFloat(item.timePerWeek) || 0;
      return total + time;
    }, 0);
  };

  const handleSave = async () => {
    if (!user) return;

    setIsSaving(true);
    try {
      const formData = { items, firstAction, timeUse };
      let savedId = decisionId;

      if (isEditMode && decisionId) {
        console.log('[StopDoingAudit] handleSave: decisionId =', decisionId, '-> branch: UPDATE');
        const { data, error } = await supabase
          .from('decisions')
          .update({
            form_data: formData,
            updated_at: new Date().toISOString(),
          })
          .eq('id', decisionId)
          .eq('user_id', user.id)
          .select();

        console.log('[StopDoingAudit] UPDATE result: rows affected =', data?.length, 'error =', error);
        if (error) throw error;
        if (!data || data.length === 0) {
          console.warn('[StopDoingAudit] UPDATE matched 0 rows for decisionId', decisionId);
        }
      } else {
        const { data, error } = await supabase
          .from('decisions')
          .insert({
            user_id: user.id,
            tool_type: 'stop_doing_audit',
            title: 'Stop Doing Audit',
            form_data: formData,
          })
          .select();

        if (data && data.length > 0) {
          savedId = data[0].id;
        }
      }

      setIsSaved(true);
      clearProgress();
      setTimeout(() => {
        navigate('/stop-doing-audit-summary', { state: { decisionId: savedId } });
      }, 500);
    } catch (error) {
      console.error('Error saving audit:', error);
      alert('Failed to save audit');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!user) return;

    setIsSaving(true);
    try {
      const formData = { items, firstAction, timeUse };

      if (decisionId) {
        await supabase
          .from('decisions')
          .update({
            form_data: formData,
            updated_at: new Date().toISOString(),
          })
          .eq('id', decisionId)
          .eq('user_id', user.id);
      } else {
        await supabase
          .from('decisions')
          .insert({
            user_id: user.id,
            tool_type: 'stop_doing_audit',
            title: 'Stop Doing Audit',
            form_data: formData,
          });
      }

      setIsSaved(true);
    } catch (error) {
      console.error('Error saving draft:', error);
      alert('Failed to save draft');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    if (window.confirm('Discard this audit?')) {
      setItems([{ id: 1, activity: '', timePerWeek: '', action: '' }]);
      setNextId(2);
      setTimeUse('');
      navigate('/decision-tools');
    }
  };

  const sectionStyle = { marginBottom: '28px', backgroundColor: 'white', padding: '16px 20px', borderRadius: '8px', borderLeft: '3px solid #F08571' };
  const labelStyle = { display: 'block', fontSize: '13px', fontWeight: '500', color: '#666', marginBottom: '6px' };
  const inputStyle = { width: '100%', padding: '10px 12px', border: '1px solid #e5e5e5', borderRadius: '6px', fontSize: '14px', fontFamily: 'inherit', boxSizing: 'border-box' };
  const textareaStyle = { width: '100%', padding: '10px 12px', border: '1px solid #e5e5e5', borderRadius: '6px', fontSize: '14px', fontFamily: 'inherit', boxSizing: 'border-box', minHeight: '80px', resize: 'none', overflow: 'hidden' };

  const totalTime = getTotalTime();

  return (
    <div style={{ minHeight: '100vh', paddingTop: '70px', backgroundColor: '#fafafa', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '900px', margin: '0 auto', width: '100%', padding: '64px 32px', paddingBottom: '120px' }} className="page-container">
        <div style={{ marginBottom: '48px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: 'black', margin: 0, marginBottom: '8px' }}>
            Stop Doing Audit
          </h1>
          <p style={{ fontSize: '14px', color: '#999', margin: 0 }}>
            Identify time-sink activities and reclaim your time
          </p>
        </div>

        <div style={sectionStyle}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '12px', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#333', margin: 0 }}>
              Which tasks and activities are stealing your time?
            </h2>
            <span style={{ fontSize: '12px', fontWeight: '500', color: '#666', whiteSpace: 'nowrap' }}>Estimated time lost</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
            {items.map((item, index) => (
              <div key={item.id} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <span style={{ fontSize: '14px', fontWeight: '600', color: '#333', minWidth: '24px' }}>
                  {index + 1}.
                </span>
                <input
                  type="text"
                  placeholder="Type here"
                  value={item.activity}
                  onChange={(e) => handleItemChange(item.id, 'activity', e.target.value)}
                  style={{ ...inputStyle, flex: 1 }}
                />
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="number"
                    placeholder="Type here"
                    min="0"
                    value={item.timePerWeek}
                    onChange={(e) => handleItemChange(item.id, 'timePerWeek', e.target.value)}
                    style={{ width: '70px', padding: '10px 12px', border: '1px solid #e5e5e5', borderRadius: '6px', fontSize: '14px', fontFamily: 'inherit', textAlign: 'center' }}
                  />
                  <span style={{ fontSize: '13px', color: '#999', minWidth: '28px' }}>hrs/wk</span>
                  <button
                    onClick={() => handleRemoveItem(item.id)}
                    disabled={items.length === 1}
                    style={{
                      padding: '6px 8px',
                      backgroundColor: 'transparent',
                      border: 'none',
                      color: items.length === 1 ? '#ddd' : '#F08571',
                      cursor: items.length === 1 ? 'not-allowed' : 'pointer',
                      transition: 'color 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
            {items.length < 5 && (
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <span style={{ fontSize: '14px', fontWeight: '600', color: '#333', minWidth: '24px' }}>
                </span>
                <button
                  onClick={handleAddItem}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 12px',
                    backgroundColor: 'transparent',
                    border: '1px solid #e5e5e5',
                    borderRadius: '6px',
                    color: '#333',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: '500',
                    transition: 'all 0.2s',
                    width: 'fit-content',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#F08571';
                    e.currentTarget.style.backgroundColor = '#f9f9f9';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#e5e5e5';
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <Plus size={14} />
                  Add activity
                </button>
              </div>
            )}
          </div>

          <div style={{
            padding: '12px 16px',
            backgroundColor: '#f9f9f9',
            borderRadius: '6px',
            border: '1px solid #e5e5e5',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <span style={{ fontSize: '14px', fontWeight: '500', color: '#333' }}>Total time to reclaim:</span>
            <span style={{ fontSize: '18px', fontWeight: '600', color: '#F08571' }}>{totalTime} hours/week</span>
          </div>
        </div>

        <div style={sectionStyle}>
          <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#333', marginBottom: '20px' }}>
            What will you do for each activity?
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {items.map((item) => (
              item.activity && (
                <div key={item.id} style={{ paddingBottom: '20px', borderBottom: '1px solid #e5e5e5' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#333', margin: 0, marginBottom: '12px' }}>
                    {item.activity}
                  </h3>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {['Stop', 'Automate', 'Delegate', 'Defer'].map((action) => (
                      <button
                        key={action}
                        onClick={() => handleItemChange(item.id, 'action', action)}
                        style={{
                          padding: '8px 16px',
                          backgroundColor: item.action === action ? '#F08571' : 'white',
                          color: item.action === action ? 'white' : '#333',
                          border: `2px solid ${item.action === action ? '#F08571' : '#e5e5e5'}`,
                          borderRadius: '6px',
                          fontSize: '13px',
                          fontWeight: '500',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => {
                          if (item.action !== action) {
                            e.currentTarget.style.borderColor = '#F08571';
                            e.currentTarget.style.backgroundColor = '#f9f9f9';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (item.action !== action) {
                            e.currentTarget.style.borderColor = '#e5e5e5';
                            e.currentTarget.style.backgroundColor = 'white';
                          }
                        }}
                      >
                        {action}
                      </button>
                    ))}
                  </div>
                </div>
              )
            ))}
          </div>
        </div>

        <div style={sectionStyle}>
          <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#333', marginBottom: '16px' }}>
            Which one will you take action on first?
          </h2>
          <label style={labelStyle}>Select the activity you'll address this week</label>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <select
              value={firstAction}
              onChange={(e) => setFirstAction(e.target.value)}
              style={{ ...inputStyle, flex: 1, marginBottom: 0 }}
            >
              <option value="">Choose an activity...</option>
              {items.map((item) => (
                item.activity && (
                  <option key={item.id} value={item.activity}>
                    {item.activity} ({item.action || 'no action selected'})
                  </option>
                )
              ))}
            </select>
            {firstAction && (
              <div style={{ fontSize: '14px', fontWeight: '600', color: '#F08571', whiteSpace: 'nowrap' }}>
                Saves {items.find(item => item.activity === firstAction)?.timePerWeek || 0} hrs/wk
              </div>
            )}
          </div>
        </div>

        <div style={sectionStyle}>
          <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#333', marginBottom: '16px' }}>
            What Will You Do With the Time Instead?
          </h2>
          <label style={labelStyle}>How will you use the hours you reclaim?</label>
          <textarea
            ref={refTimeUse}
            placeholder="Type here"
            value={timeUse}
            onChange={(e) => setTimeUse(e.target.value)}
            style={{ ...textareaStyle, marginBottom: 0 }}
          />
        </div>
      </div>

      {/* Fixed bottom bar */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#fafafa',
        borderTop: '1px solid #e5e5e5',
        padding: '12px 32px',
        display: 'flex',
        justifyContent: 'center',
        gap: '12px',
        zIndex: 10,
      }}>
        <button
          onClick={handleDelete}
          title="Delete audit"
          style={{
            padding: '8px 12px',
            backgroundColor: 'transparent',
            color: '#F08571',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f0f0f0'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          <Trash2 size={18} />
        </button>

        <button
          onClick={handleSaveDraft}
          disabled={isSaving}
          style={{
            padding: '10px 16px',
            backgroundColor: 'transparent',
            border: '1px solid #e5e5e5',
            borderRadius: '6px',
            color: '#333',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '500',
            transition: 'all 0.2s',
            opacity: isSaving ? 0.7 : 1,
          }}
          onMouseEnter={(e) => {
            if (!isSaving) {
              e.currentTarget.style.borderColor = '#F08571';
              e.currentTarget.style.backgroundColor = '#f9f9f9';
            }
          }}
          onMouseLeave={(e) => {
            if (!isSaving) {
              e.currentTarget.style.borderColor = '#e5e5e5';
              e.currentTarget.style.backgroundColor = 'transparent';
            }
          }}
        >
          Save as Draft
        </button>

        <button
          onClick={handleSave}
          disabled={isSaving}
          style={{
            padding: '10px 20px',
            backgroundColor: '#F08571',
            color: 'white',
            fontWeight: '600',
            border: 'none',
            borderRadius: '6px',
            cursor: isSaving ? 'not-allowed' : 'pointer',
            fontSize: '13px',
            transition: 'all 0.2s',
            opacity: isSaving ? 0.7 : 1,
          }}
          onMouseEnter={(e) => {
            if (!isSaving) e.currentTarget.style.backgroundColor = '#e07560';
          }}
          onMouseLeave={(e) => {
            if (!isSaving) e.currentTarget.style.backgroundColor = '#F08571';
          }}
        >
          {isSaved ? 'Finished' : 'Finish'}
        </button>
      </div>
    </div>
  );
}
