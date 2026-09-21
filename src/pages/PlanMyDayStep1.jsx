import { useState, useContext, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { clearProgress } from '../lib/saveProgress';
import HomeHeader from '../components/HomeHeader';
import { useAutoExpandTextarea } from '../hooks/useAutoExpandTextarea';

export default function PlanMyDayStep1() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const isGuest = location.state?.isGuest || false;
  const decisionId = location.state?.decisionId;
  const isEditMode = Boolean(decisionId);
  const [topPriority, setTopPriority] = useState(() => location.state?.topPriority || '');
  const [showUp, setShowUp] = useState(() => location.state?.showUp || '');
  const [notDo, setNotDo] = useState(() => location.state?.notDo || '');
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const refTopPriority = useRef(null);
  const refShowUp = useRef(null);
  const refNotDo = useRef(null);
  useAutoExpandTextarea(refTopPriority, topPriority);
  useAutoExpandTextarea(refShowUp, showUp);
  useAutoExpandTextarea(refNotDo, notDo);

  useEffect(() => {
    console.log('[PlanMyDayStep1] mounted/updated. location.state:', location.state, '-> decisionId:', decisionId, 'isEditMode:', isEditMode);
  }, [location.state, decisionId, isEditMode]);

  const handleSave = async () => {
    if (!user && !isGuest) {
      alert('Please log in to save');
      return;
    }

    if (isGuest) {
      alert('Please log in to save decisions');
      return;
    }

    setIsSaving(true);
    try {
      const formData = {
        topPriority,
        showUp,
        notDo,
      };

      const title = `Daily Plan - ${new Date().toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}`;

      let resultDecisionId = decisionId;

      console.log('[PlanMyDayStep1] handleSave: decisionId =', decisionId, 'isEditMode =', isEditMode, '-> branch:', (isEditMode && decisionId) ? 'UPDATE' : 'INSERT');

      if (isEditMode && decisionId) {
        // Update existing decision (edit mode)
        const { data, error } = await supabase
          .from('decisions')
          .update({
            form_data: formData,
            title,
            status: 'completed',
            draft: false,
            updated_at: new Date().toISOString(),
          })
          .eq('id', decisionId)
          .eq('user_id', user.id)
          .select();

        console.log('[PlanMyDayStep1] UPDATE result: rows affected =', data?.length, 'error =', error);

        if (error) throw error;
        if (!data || data.length === 0) {
          console.warn('[PlanMyDayStep1] UPDATE matched 0 rows for decisionId', decisionId, '- check that this id exists and belongs to user', user.id);
        }
      } else {
        // Create new decision
        const { data, error } = await supabase
          .from('decisions')
          .insert([{
            user_id: user.id,
            tool_type: 'daily_plan',
            title,
            form_data: formData,
            status: 'completed',
            draft: false,
          }])
          .select();

        console.log('[PlanMyDayStep1] INSERT result: new id =', data?.[0]?.id, 'error =', error);

        if (error) throw error;
        resultDecisionId = data?.[0]?.id;
      }

      setSaved(true);
      clearProgress();
      setTimeout(() => {
        navigate('/daily-plan-summary', {
          state: {
            decisionId: resultDecisionId,
            isGuest
          }
        });
      }, 1500);
    } catch (error) {
      console.error('Error saving plan:', error);
      alert(`Failed to save plan: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    if (window.confirm('Discard this plan?')) {
      setTopPriority('');
      setShowUp('');
      setNotDo('');
      navigate('/decision-history', { state: { isGuest } });
    }
  };

  const sectionStyle = {
    marginBottom: '28px',
    backgroundColor: 'white',
    padding: '20px',
    borderRadius: '8px',
    borderLeft: '3px solid #F08571'
  };
  const labelStyle = { display: 'block', fontSize: '13px', fontWeight: '500', color: '#666', marginBottom: '6px' };
  const inputStyle = { width: '100%', padding: '10px 12px', border: '1px solid #e5e5e5', borderRadius: '6px', fontSize: '14px', fontFamily: 'inherit', boxSizing: 'border-box' };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#fafafa', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', marginTop: '100px', margin: '0 auto', width: '100%', padding: '64px 32px', paddingBottom: '120px', marginTop: '100px' }} className="page-container">
        <div style={{ marginBottom: '48px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: 'black', margin: 0, marginBottom: '8px' }}>
            Daily Intentions
          </h1>
          <p style={{ fontSize: '14px', color: '#999', margin: 0 }}>
            Make sure your day aligns with your mission.
          </p>
        </div>

        <div style={{ width: '100%', height: '4px', backgroundColor: '#e5e5e5', borderRadius: '2px', marginBottom: '32px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: '100%', backgroundColor: '#F08571', transition: 'width 0.3s ease' }} />
        </div>

        <div style={{ marginBottom: '32px', display: 'grid', gridTemplateColumns: '1fr', gap: '0' }}>
          <div style={sectionStyle}>
            <label style={labelStyle}>
              What's your top priority today?
            </label>
            <textarea
              ref={refTopPriority}
              value={topPriority}
              onChange={(e) => setTopPriority(e.target.value)}
              placeholder="Type here"
              style={{...inputStyle, minHeight: '100px', fontFamily: 'inherit', resize: 'none', overflow: 'hidden'}}
            />
          </div>

          <div style={sectionStyle}>
            <label style={labelStyle}>
              What's within your control today?
            </label>
            <textarea
              ref={refShowUp}
              value={showUp}
              onChange={(e) => setShowUp(e.target.value)}
              placeholder="Type here"
              style={{...inputStyle, minHeight: '100px', fontFamily: 'inherit', resize: 'none', overflow: 'hidden'}}
            />
          </div>

          <div style={sectionStyle}>
            <label style={labelStyle}>
              What do you not want to do today?
            </label>
            <textarea
              ref={refNotDo}
              value={notDo}
              onChange={(e) => setNotDo(e.target.value)}
              placeholder="Type here"
              style={{...inputStyle, minHeight: '100px', fontFamily: 'inherit', resize: 'none', overflow: 'hidden'}}
            />
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
        {saved && (
          <div style={{ textAlign: 'center', color: '#5ECCC0', fontSize: '14px', fontWeight: '600', position: 'absolute', left: '32px' }}>
            ✓ Daily plan saved
          </div>
        )}
        <button
          onClick={handleDelete}
          title="Delete plan"
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
            justifyContent: 'center',
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f0f0f0'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          <Trash2 size={18} />
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
            opacity: isSaving ? 0.7 : 1,
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => !isSaving && (e.currentTarget.style.backgroundColor = '#e07560')}
          onMouseLeave={(e) => !isSaving && (e.currentTarget.style.backgroundColor = '#F08571')}
        >
          {isSaving ? 'Finishing...' : 'Finish'}
        </button>
      </div>
    </div>
  );
}
