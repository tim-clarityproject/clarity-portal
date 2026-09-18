import { useState, useContext, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Plus, Trash2, Save, ChevronDown } from 'lucide-react';
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

  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [chair, setChair] = useState('');
  const [objectives, setObjectives] = useState([{ id: 1, text: '' }]);
  const [nextObjectiveId, setNextObjectiveId] = useState(2);
  const [flowItems, setFlowItems] = useState([
    { id: 1, item: '', aim: '', lead: '', length: '' },
  ]);
  const [nextItemId, setNextItemId] = useState(2);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [sections, setSections] = useState(['agenda']);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [preReads, setPreReads] = useState('');
  const [meetingContext, setMeetingContext] = useState('');
  const dropdownRef = useRef(null);

  const availableSections = [
    { id: 'context', label: 'Meeting Context' },
    { id: 'pre-reads', label: 'Attendee Preparation' },
  ];

  const addSection = (sectionId) => {
    if (!sections.includes(sectionId)) {
      setSections([...sections, sectionId]);
    }
    setDropdownOpen(false);
  };

  const removeSection = (sectionId) => {
    setSections(sections.filter(s => s !== sectionId));
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

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
        setTitle(formData.title || '');
        setDate(formData.date || '');
        setTime(formData.time || '');
        setChair(formData.chair || '');
        setMeetingContext(formData.meetingContext || '');
        setPreReads(formData.preReads || '');
        if (formData.sections) setSections(formData.sections);
        if (formData.objectives && formData.objectives.length > 0) {
          setObjectives(formData.objectives);
          const maxId = Math.max(...formData.objectives.map(obj => obj.id || 0));
          setNextObjectiveId(maxId + 1);
        }
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

  const handleAddObjective = () => {
    setObjectives([
      ...objectives,
      { id: nextObjectiveId, text: '' },
    ]);
    setNextObjectiveId(nextObjectiveId + 1);
  };

  const handleRemoveObjective = (id) => {
    if (objectives.length > 1) {
      setObjectives(objectives.filter(obj => obj.id !== id));
    }
  };

  const handleObjectiveChange = (id, text) => {
    setObjectives(objectives.map(obj =>
      obj.id === id ? { ...obj, text } : obj
    ));
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
    if (!user) return;

    setIsSaving(true);
    try {
      const formData = {
        title,
        date,
        time,
        chair,
        objectives,
        flowItems,
        sections,
        meetingContext,
        preReads,
      };

      let savedId = decisionId;
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
        const { data, error } = await supabase
          .from('decisions')
          .insert({
            user_id: user.id,
            tool_type: 'plan_meeting',
            title: title || `Meeting on ${date}`,
            form_data: formData,
          })
          .select();

        if (data && data.length > 0) {
          savedId = data[0].id;
        }
      }

      setIsSaved(true);
      setTimeout(() => {
        navigate('/meeting-summary', { state: { isGuest, decisionId: savedId } });
      }, 500);
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

  const labelStyle = { display: 'block', fontSize: '13px', fontWeight: '500', color: '#666', marginBottom: '6px' };
  const inputStyle = { width: '100%', padding: '10px 12px', border: '1px solid #e5e5e5', borderRadius: '6px', fontSize: '14px', fontFamily: 'inherit', boxSizing: 'border-box' };
  const sectionStyle = { marginBottom: '28px', paddingBottom: '0', borderLeft: '3px solid #F08571' };
  const sectionInnerStyle = { paddingLeft: '24px' };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#fafafa', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '900px', margin: '0 auto', width: '100%', padding: '64px 32px', paddingBottom: '80px' }} className="page-container">
        <BackArrow />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: 'black', margin: 0 }}>
            Plan a Meeting
          </h1>
          <div style={{ position: 'relative' }} ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
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
              <Plus size={14} />
              Add sections
              <ChevronDown size={14} style={{ transform: dropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
            </button>
            {dropdownOpen && (
              <div style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                backgroundColor: 'white',
                border: '1px solid #e5e5e5',
                borderRadius: '6px',
                marginTop: '4px',
                minWidth: '200px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                zIndex: 100,
              }}>
                {availableSections.map(section => (
                  <button
                    key={section.id}
                    onClick={() => addSection(section.id)}
                    disabled={sections.includes(section.id)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      backgroundColor: sections.includes(section.id) ? '#FEE5DE' : 'white',
                      border: 'none',
                      textAlign: 'left',
                      cursor: sections.includes(section.id) ? 'not-allowed' : 'pointer',
                      fontSize: '13px',
                      color: sections.includes(section.id) ? '#999' : '#333',
                      borderBottom: '1px solid #f0f0f0',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      if (!sections.includes(section.id)) {
                        e.currentTarget.style.backgroundColor = '#f9f9f9';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!sections.includes(section.id)) {
                        e.currentTarget.style.backgroundColor = 'white';
                      }
                    }}
                  >
                    {section.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Meeting Title & Chair Section */}
        <div style={{ ...sectionStyle, backgroundColor: 'white', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
          <div style={sectionInnerStyle}>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end' }}>
              <div style={{ flex: 1, maxWidth: '500px' }}>
                <label style={labelStyle}>Meeting Title</label>
                <input
                  type="text"
                  placeholder="e.g., Q3 Planning Session"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div style={{ maxWidth: '200px' }}>
                <label style={labelStyle}>Chair</label>
                <input type="text" placeholder="Who is chairing?" value={chair} onChange={(e) => setChair(e.target.value)} style={inputStyle} />
              </div>
            </div>
          </div>
        </div>

        {/* Date & Time Card */}
        <div style={{ ...sectionStyle, backgroundColor: 'white', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
          <div style={sectionInnerStyle}>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end' }}>
              <div style={{ maxWidth: '150px' }}>
                <label style={labelStyle}>Date</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
              </div>
              <div style={{ maxWidth: '120px' }}>
                <label style={labelStyle}>Time</label>
                <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={inputStyle} />
              </div>
            </div>
          </div>
        </div>

        {/* Meeting Context Section */}
        {sections.includes('context') && (
          <div style={{ ...sectionStyle, backgroundColor: 'white', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
            <div style={sectionInnerStyle}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <label style={{...labelStyle, marginBottom: 0}}>Meeting Context</label>
                <button
                  onClick={() => removeSection('context')}
                  title="Remove this section"
                  style={{
                    padding: '4px 8px',
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: '#999',
                    cursor: 'pointer',
                    transition: 'color 0.2s',
                    fontSize: '12px',
                    fontWeight: '500',
                  }}
                  onMouseEnter={(e) => e.target.style.color = '#F08571'}
                  onMouseLeave={(e) => e.target.style.color = '#999'}
                >
                  Remove
                </button>
              </div>
              <textarea
                placeholder="What's the background behind this meeting?"
                value={meetingContext}
                onChange={(e) => setMeetingContext(e.target.value)}
                style={{...inputStyle, minHeight: '60px'}}
              />
            </div>
          </div>
        )}

        {/* Attendee Preparation Section */}
        {sections.includes('pre-reads') && (
          <div style={{ ...sectionStyle, backgroundColor: 'white', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
            <div style={sectionInnerStyle}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <label style={{...labelStyle, marginBottom: 0}}>Attendee Preparation</label>
                <button
                  onClick={() => removeSection('pre-reads')}
                  title="Remove this section"
                  style={{
                    padding: '4px 8px',
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: '#999',
                    cursor: 'pointer',
                    transition: 'color 0.2s',
                    fontSize: '12px',
                    fontWeight: '500',
                  }}
                  onMouseEnter={(e) => e.target.style.color = '#F08571'}
                  onMouseLeave={(e) => e.target.style.color = '#999'}
                >
                  Remove
                </button>
              </div>
              <textarea
                placeholder="What should attendees read, research, or think about beforehand?"
                value={preReads}
                onChange={(e) => setPreReads(e.target.value)}
                style={{...inputStyle, minHeight: '60px'}}
              />
            </div>
          </div>
        )}

        {/* Objectives */}
        <div style={{ ...sectionStyle, backgroundColor: 'white', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
          <div style={sectionInnerStyle}>
            <label style={{...labelStyle, marginBottom: '10px'}}>Objectives (In Priority Order)</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
              {objectives.map((obj, index) => (
                <div key={obj.id} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '13px', fontWeight: '500', color: '#999', minWidth: '24px' }}>
                    {index + 1}.
                  </span>
                  <input
                    type="text"
                    placeholder="What do you want to achieve?"
                    value={obj.text}
                    onChange={(e) => handleObjectiveChange(obj.id, e.target.value)}
                    style={{...inputStyle, flex: 1}}
                  />
                  <button
                    onClick={() => handleRemoveObjective(obj.id)}
                    disabled={objectives.length === 1}
                    style={{
                      padding: '6px 8px',
                      backgroundColor: 'transparent',
                      border: 'none',
                      color: objectives.length === 1 ? '#ddd' : '#F08571',
                      cursor: objectives.length === 1 ? 'not-allowed' : 'pointer',
                      transition: 'color 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                    onMouseEnter={(e) => {
                      if (objectives.length > 1) e.target.style.color = '#e07560';
                    }}
                    onMouseLeave={(e) => {
                      if (objectives.length > 1) e.target.style.color = '#F08571';
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={handleAddObjective}
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
                marginLeft: '34px',
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
              <Plus size={14} />
              Add objective
            </button>
          </div>
        </div>

        {/* Meeting Agenda */}
        <div style={{ ...sectionStyle, backgroundColor: 'white', padding: '20px', borderRadius: '8px' }}>
          <div style={sectionInnerStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <label style={{...labelStyle, marginBottom: 0}}>Meeting Agenda</label>
              {totalLength > 0 && (
                <span style={{ fontSize: '12px', color: '#999', backgroundColor: '#f0f0f0', padding: '4px 12px', borderRadius: '4px' }}>
                  Total: {totalLength} min
                </span>
              )}
            </div>

            <div style={{ overflowX: 'auto', marginBottom: '16px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '2px solid #e5e5e5' }}>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#666' }}>Item</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#666' }}>Aim</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#666' }}>Lead</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#666', width: '70px' }}>Length</th>
                    <th style={{ padding: '12px', width: '32px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {flowItems.map((item, idx) => (
                    <tr key={item.id} style={{ backgroundColor: idx % 2 === 0 ? '#ffffff' : '#fafafa', borderBottom: '1px solid #e5e5e5' }}>
                      <td style={{ padding: '12px' }}>
                        <input type="text" placeholder="e.g., Welcome" value={item.item} onChange={(e) => handleItemChange(item.id, 'item', e.target.value)} style={inputStyle} />
                      </td>
                      <td style={{ padding: '12px' }}>
                        <input type="text" placeholder="Goal or outcome" value={item.aim} onChange={(e) => handleItemChange(item.id, 'aim', e.target.value)} style={inputStyle} />
                      </td>
                      <td style={{ padding: '12px' }}>
                        <input type="text" placeholder="Person/Role" value={item.lead} onChange={(e) => handleItemChange(item.id, 'lead', e.target.value)} style={inputStyle} />
                      </td>
                      <td style={{ padding: '12px' }}>
                        <input type="number" placeholder="0" value={item.length} onChange={(e) => handleItemChange(item.id, 'length', e.target.value)} min="0" style={inputStyle} />
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <button
                          onClick={() => handleRemoveItem(item.id)}
                          disabled={flowItems.length === 1}
                          style={{
                            padding: '4px 6px',
                            backgroundColor: 'transparent',
                            border: 'none',
                            color: flowItems.length === 1 ? '#ddd' : '#F08571',
                            cursor: flowItems.length === 1 ? 'not-allowed' : 'pointer',
                            transition: 'color 0.2s',
                            display: 'flex',
                            alignItems: 'center',
                          }}
                          onMouseEnter={(e) => {
                            if (flowItems.length > 1) e.target.style.color = '#e07560';
                          }}
                          onMouseLeave={(e) => {
                            if (flowItems.length > 1) e.target.style.color = '#F08571';
                          }}
                        >
                          <Trash2 size={14} />
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
              <Plus size={14} />
              Add agenda item
            </button>
          </div>
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
          onClick={handleSave}
          disabled={isSaving}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
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
          <Save size={16} />
          {isSaved ? 'Saved' : 'Save'}
        </button>
        <button
          onClick={handleNavigateToPlans}
          style={{
            padding: '10px 16px',
            backgroundColor: 'transparent',
            border: '1px solid #e5e5e5',
            color: '#333',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '500',
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
