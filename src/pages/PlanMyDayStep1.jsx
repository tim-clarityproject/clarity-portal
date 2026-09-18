import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { clearProgress } from '../lib/saveProgress';
import HomeHeader from '../components/HomeHeader';

export default function PlanMyDayStep1() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const isGuest = location.state?.isGuest || false;
  const decisionId = location.state?.decisionId;
  const [topPriority, setTopPriority] = useState(() => location.state?.topPriority || '');
  const [success, setSuccess] = useState(() => location.state?.success || '');
  const [showUp, setShowUp] = useState(() => location.state?.showUp || '');
  const [notDo, setNotDo] = useState(() => location.state?.notDo || '');
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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
        success,
        showUp,
        notDo,
      };

      const title = `Daily Plan - ${new Date().toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}`;

      let resultDecisionId = decisionId;

      if (decisionId) {
        // Update existing decision
        const { error } = await supabase
          .from('decisions')
          .update({
            form_data: formData,
            title,
            status: 'completed',
            draft: false,
          })
          .eq('id', decisionId)
          .eq('user_id', user.id);

        if (error) throw error;
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
      setSuccess('');
      setShowUp('');
      setNotDo('');
      navigate('/decision-history', { state: { isGuest } });
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '64px 32px' }} className="page-container">
        <div style={{ marginBottom: '48px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: 'black', margin: 0, marginBottom: '8px' }}>
            Plan My Day
          </h1>
          <p style={{ fontSize: '14px', color: '#999', margin: 0 }}>
            Set yourself up for success
          </p>
        </div>

        <div style={{ marginBottom: '32px', display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#333', marginBottom: '8px' }}>
              What's your top priority today?
            </label>
            <textarea
              value={topPriority}
              onChange={(e) => setTopPriority(e.target.value)}
              placeholder="What's the one thing that matters most..."
              style={{
                width: '100%',
                minHeight: '120px',
                padding: '12px',
                border: '2px solid #e5e5e5',
                borderRadius: '6px',
                fontSize: '13px',
                fontFamily: 'system-ui, -apple-system, sans-serif',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#333', marginBottom: '8px' }}>
              What would make today a success for you?
            </label>
            <textarea
              value={success}
              onChange={(e) => setSuccess(e.target.value)}
              placeholder="Describe what a successful day looks like..."
              style={{
                width: '100%',
                minHeight: '120px',
                padding: '12px',
                border: '2px solid #e5e5e5',
                borderRadius: '6px',
                fontSize: '13px',
                fontFamily: 'system-ui, -apple-system, sans-serif',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#333', marginBottom: '8px' }}>
              How do you want to show up today?
            </label>
            <textarea
              value={showUp}
              onChange={(e) => setShowUp(e.target.value)}
              placeholder="What qualities or mindset do you want to embody..."
              style={{
                width: '100%',
                minHeight: '120px',
                padding: '12px',
                border: '2px solid #e5e5e5',
                borderRadius: '6px',
                fontSize: '13px',
                fontFamily: 'system-ui, -apple-system, sans-serif',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#333', marginBottom: '8px' }}>
              What do you not want to do today?
            </label>
            <textarea
              value={notDo}
              onChange={(e) => setNotDo(e.target.value)}
              placeholder="What should you avoid or not focus on..."
              style={{
                width: '100%',
                minHeight: '120px',
                padding: '12px',
                border: '2px solid #e5e5e5',
                borderRadius: '6px',
                fontSize: '13px',
                fontFamily: 'system-ui, -apple-system, sans-serif',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        {saved && (
          <div style={{ textAlign: 'center', color: '#5ECCC0', fontSize: '14px', fontWeight: '600', marginBottom: '16px' }}>
            ✓ Daily plan saved
          </div>
        )}

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button
            onClick={handleDelete}
            title="Delete plan"
            style={{
              padding: '8px',
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
            onMouseEnter={(e) => e.target.style.backgroundColor = '#f0f0f0'}
            onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
          >
            <Trash2 size={18} />
          </button>

          <button
            onClick={handleSave}
            disabled={isSaving}
            style={{
              flex: 1,
              padding: '14px 24px',
              backgroundColor: '#F08571',
              color: 'white',
              fontWeight: 'bold',
              border: 'none',
              borderRadius: '8px',
              cursor: isSaving ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              opacity: isSaving ? 0.7 : 1,
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
