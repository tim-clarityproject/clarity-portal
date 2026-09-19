import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { clearProgress } from '../lib/saveProgress';
import HomeHeader from '../components/HomeHeader';

export default function IfThenPlanning() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const isGuest = location.state?.isGuest || false;
  const decisionId = location.state?.decisionId;

  const [items, setItems] = useState([{ id: 1, ifCondition: '', thenAction: '' }]);
  const [nextId, setNextId] = useState(2);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    if (decisionId && user && !isGuest) {
      loadPlanning();
    }
  }, [decisionId, user, isGuest]);

  const loadPlanning = async () => {
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
      }
    } catch (error) {
      console.error('Error loading planning:', error);
    }
  };

  const handleAddItem = () => {
    setItems([...items, { id: nextId, ifCondition: '', thenAction: '' }]);
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

  const handleSave = async () => {
    if (!user) return;

    setIsSaving(true);
    try {
      const formData = { items };

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
            tool_type: 'if_then_planning',
            title: 'If-Then Planning',
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
        navigate('/my-plans', { state: { isGuest } });
      }, 500);
    } catch (error) {
      console.error('Error saving planning:', error);
      alert('Failed to save planning');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!user) return;

    setIsSaving(true);
    try {
      const formData = { items };

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
            tool_type: 'if_then_planning',
            title: 'If-Then Planning',
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
    if (window.confirm('Discard this planning?')) {
      setItems([{ id: 1, ifCondition: '', thenAction: '' }]);
      setNextId(2);
      navigate('/decision-tools', { state: { isGuest } });
    }
  };

  const sectionStyle = { marginBottom: '28px', backgroundColor: 'white', padding: '20px', borderRadius: '8px', borderLeft: '3px solid #F08571' };
  const labelStyle = { display: 'block', fontSize: '13px', fontWeight: '500', color: '#666', marginBottom: '6px' };
  const inputStyle = { width: '100%', padding: '10px 12px', border: '1px solid #e5e5e5', borderRadius: '6px', fontSize: '14px', fontFamily: 'inherit', boxSizing: 'border-box' };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#fafafa', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '900px', margin: '0 auto', width: '100%', padding: '64px 32px', paddingBottom: '120px' }} className="page-container">
        <div style={{ marginBottom: '48px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: 'black', margin: 0, marginBottom: '8px' }}>
            If-Then Planning
          </h1>
          <p style={{ fontSize: '14px', color: '#999', margin: 0 }}>
            Prepare for uncertain situations with contingency plans
          </p>
        </div>

        <div style={sectionStyle}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 40px', gap: '16px', marginBottom: '20px', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: '600', color: '#333', marginBottom: '0' }}>When this happens</div>
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: '600', color: '#333', marginBottom: '0' }}>My response will be</div>
            </div>
            <div></div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
            {items.map((item, index) => (
              <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 40px', gap: '16px', alignItems: 'flex-start' }}>
                <input
                  type="text"
                  placeholder="e.g., I start to feel overwhelmed"
                  value={item.ifCondition}
                  onChange={(e) => handleItemChange(item.id, 'ifCondition', e.target.value)}
                  style={inputStyle}
                />
                <input
                  type="text"
                  placeholder="e.g., take 5 deep breaths and step outside"
                  value={item.thenAction}
                  onChange={(e) => handleItemChange(item.id, 'thenAction', e.target.value)}
                  style={inputStyle}
                />
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
                  onMouseEnter={(e) => {
                    if (items.length > 1) e.currentTarget.style.color = '#e07560';
                  }}
                  onMouseLeave={(e) => {
                    if (items.length > 1) e.currentTarget.style.color = '#F08571';
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
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
            Add scenario
          </button>
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
          title="Delete planning"
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
              e.currentTarget.style.backgroundColor = '#FEE5DE';
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
