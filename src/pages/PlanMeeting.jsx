import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Plus, Trash2, Save } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import HomeHeader from '../components/HomeHeader';
import BackArrow from '../components/BackArrow';

export default function PlanMeeting() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const isGuest = location.state?.isGuest || false;
  const decisionId = location.state?.decisionId;

  const [chair, setChair] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [objectives, setObjectives] = useState('');
  const [flowItems, setFlowItems] = useState([
    { id: 1, item: '', aim: '', lead: '', length: '' },
  ]);
  const [nextItemId, setNextItemId] = useState(2);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    if (decisionId && user && !isGuest) {
      loadMeeting();
    }
  }, [decisionId, user, isGuest]);

  const loadMeeting = async () => {
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
        setChair(formData.chair || '');
        setDate(formData.date || '');
        setTime(formData.time || '');
        setObjectives(formData.objectives || '');
        if (formData.flowItems && formData.flowItems.length > 0) {
          setFlowItems(formData.flowItems);
          const maxId = Math.max(...formData.flowItems.map(item => item.id || 0));
          setNextItemId(maxId + 1);
        }
      }
    } catch (error) {
      console.error('Error loading meeting:', error);
    }
  };

  const handleAddItem = () => {
    setFlowItems([
      ...flowItems,
      { id: nextItemId, item: '', aim: '', lead: '', length: '' },
    ]);
    setNextItemId(nextItemId + 1);
  };

  const handleRemoveItem = (id) => {
    if (flowItems.length > 1) {
      setFlowItems(flowItems.filter(item => item.id !== id));
    }
  };

  const handleItemChange = (id, field, value) => {
    setFlowItems(flowItems.map(item =>
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  const handleSave = async () => {
    if (!user || isGuest) return;

    setIsSaving(true);
    try {
      const formData = {
        chair,
        date,
        time,
        objectives,
        flowItems,
      };

      if (decisionId) {
        // Update existing
        await supabase
          .from('decisions')
          .update({
            form_data: formData,
            updated_at: new Date().toISOString(),
          })
          .eq('id', decisionId)
          .eq('user_id', user.id);
      } else {
        // Create new
        await supabase
          .from('decisions')
          .insert({
            user_id: user.id,
            tool_type: 'plan_meeting',
            title: `Meeting on ${date}`,
            form_data: formData,
          });
      }

      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2000);
    } catch (error) {
      console.error('Error saving meeting:', error);
      alert('Failed to save meeting');
    } finally {
      setIsSaving(false);
    }
  };

  const handleNavigateToPlans = () => {
    navigate('/my-plans', { state: { isGuest } });
  };

  const totalLength = flowItems.reduce((sum, item) => {
    const length = parseInt(item.length) || 0;
    return sum + length;
  }, 0);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '900px', margin: '0 auto', width: '100%', padding: '64px 32px', paddingBottom: '80px' }} className="page-container">
        <BackArrow />

        <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: 'black', margin: '24px 0 32px 0' }}>Plan a Meeting</h1>

        {/* Meeting Details */}
        <div style={{ marginBottom: '40px' }}>
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#333', marginBottom: '8px' }}>
              Chair
            </label>
            <input
              type="text"
              placeholder="Who is chairing?"
              value={chair}
              onChange={(e) => setChair(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 16px',
                border: '1px solid #e5e5e5',
                borderRadius: '8px',
                fontSize: '14px',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#333', marginBottom: '8px' }}>
                Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: '1px solid #e5e5e5',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#333', marginBottom: '8px' }}>
                Time
              </label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: '1px solid #e5e5e5',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#333', marginBottom: '8px' }}>
              Objectives
            </label>
            <textarea
              placeholder="What are the key objectives for this meeting?"
              value={objectives}
              onChange={(e) => setObjectives(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 16px',
                border: '1px solid #e5e5e5',
                borderRadius: '8px',
                fontSize: '14px',
                fontFamily: 'inherit',
                minHeight: '100px',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        {/* Meeting Flow Table */}
        <div style={{ marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#333', margin: 0 }}>Meeting Flow</h2>
            {totalLength > 0 && (
              <span style={{ fontSize: '12px', color: '#999' }}>Total: {totalLength} minutes</span>
            )}
          </div>

          <div style={{ overflowX: 'auto', marginBottom: '16px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e5e5' }}>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Item</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Aim</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Lead</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px', width: '80px' }}>Length (min)</th>
                  <th style={{ padding: '12px', width: '40px' }}></th>
                </tr>
              </thead>
              <tbody>
                {flowItems.map((item, index) => (
                  <tr key={item.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '12px' }}>
                      <input
                        type="text"
                        placeholder="e.g., Welcome"
                        value={item.item}
                        onChange={(e) => handleItemChange(item.id, 'item', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          border: '1px solid #e5e5e5',
                          borderRadius: '4px',
                          fontSize: '14px',
                          fontFamily: 'inherit',
                          boxSizing: 'border-box',
                        }}
                      />
                    </td>
                    <td style={{ padding: '12px' }}>
                      <input
                        type="text"
                        placeholder="Goal or outcome"
                        value={item.aim}
                        onChange={(e) => handleItemChange(item.id, 'aim', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          border: '1px solid #e5e5e5',
                          borderRadius: '4px',
                          fontSize: '14px',
                          fontFamily: 'inherit',
                          boxSizing: 'border-box',
                        }}
                      />
                    </td>
                    <td style={{ padding: '12px' }}>
                      <input
                        type="text"
                        placeholder="Person/Role"
                        value={item.lead}
                        onChange={(e) => handleItemChange(item.id, 'lead', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          border: '1px solid #e5e5e5',
                          borderRadius: '4px',
                          fontSize: '14px',
                          fontFamily: 'inherit',
                          boxSizing: 'border-box',
                        }}
                      />
                    </td>
                    <td style={{ padding: '12px' }}>
                      <input
                        type="number"
                        placeholder="0"
                        value={item.length}
                        onChange={(e) => handleItemChange(item.id, 'length', e.target.value)}
                        min="0"
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          border: '1px solid #e5e5e5',
                          borderRadius: '4px',
                          fontSize: '14px',
                          fontFamily: 'inherit',
                          boxSizing: 'border-box',
                        }}
                      />
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <button
                        onClick={() => handleRemoveItem(item.id)}
                        disabled={flowItems.length === 1}
                        style={{
                          padding: '4px 8px',
                          backgroundColor: 'transparent',
                          border: 'none',
                          color: flowItems.length === 1 ? '#ddd' : '#F08571',
                          cursor: flowItems.length === 1 ? 'not-allowed' : 'pointer',
                          transition: 'color 0.2s',
                        }}
                        onMouseEnter={(e) => {
                          if (flowItems.length > 1) e.target.style.color = '#e07560';
                        }}
                        onMouseLeave={(e) => {
                          if (flowItems.length > 1) e.target.style.color = '#F08571';
                        }}
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            onClick={handleAddItem}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 16px',
              backgroundColor: 'transparent',
              border: '2px solid #e5e5e5',
              borderRadius: '6px',
              color: '#333',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '600',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#F08571';
              e.currentTarget.style.backgroundColor = '#FEE5DE';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#e5e5e5';
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <Plus size={18} />
            Add agenda item
          </button>
        </div>
      </div>

      {/* Fixed bottom bar for saving */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#fafafa',
        borderTop: '1px solid #e5e5e5',
        padding: '16px 32px',
        display: 'flex',
        justifyContent: 'center',
        gap: '12px',
        zIndex: 10,
      }}>
        {!isGuest && (
          <button
            onClick={handleSave}
            disabled={isSaving}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 24px',
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
            <Save size={16} />
            {isSaved ? 'Saved' : 'Save'}
          </button>
        )}
        <button
          onClick={handleNavigateToPlans}
          style={{
            padding: '10px 20px',
            backgroundColor: 'transparent',
            border: '2px solid #e5e5e5',
            color: '#333',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '600',
            borderRadius: '6px',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#F08571';
            e.currentTarget.style.backgroundColor = '#FEE5DE';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#e5e5e5';
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          View all plans
        </button>
      </div>
    </div>
  );
}
