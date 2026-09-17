import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { FormContext } from '../context/FormContext';
import { supabase } from '../lib/supabase';
import { clearProgress } from '../lib/saveProgress';
import SaveDiscardButtons from '../components/SaveDiscardButtons';
import HomeHeader from '../components/HomeHeader';

export default function PlanMyDayStep1() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const { formData, setFormData, clearForm } = useContext(FormContext);

  const [success, setSuccess] = useState(formData.daySuccess || '');
  const [showUp, setShowUp] = useState(formData.dayShowUp || '');
  const [notDo, setNotDo] = useState(formData.dayNotDo || '');
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const isGuest = location.state?.isGuest || false;

  useEffect(() => {
    setFormData({
      daySuccess: success,
      dayShowUp: showUp,
      dayNotDo: notDo,
    });
  }, [success, showUp, notDo, setFormData]);

  const handleSaveAsDraft = async () => {
    if (!user || isGuest) {
      alert('Please log in to save');
      return;
    }

    setIsSaving(true);
    try {
      const planData = {
        success,
        showUp,
        notDo,
      };

      const { error } = await supabase
        .from('daily_plans')
        .insert([{
          user_id: user.id,
          plan_date: new Date().toISOString().split('T')[0],
          data: planData,
          created_at: new Date().toISOString(),
        }]);

      if (error) {
        console.error('Error saving daily plan:', error);
        throw error;
      }

      clearProgress();
      setSaved(true);
      setTimeout(() => {
        clearForm();
        navigate('/welcome');
      }, 1500);
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to save plan');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '64px 32px' }}>
        <div style={{ marginBottom: '48px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: 'black', margin: 0, marginBottom: '8px' }}>
              Plan My Day
            </h1>
            <p style={{ fontSize: '14px', color: '#999', margin: 0 }}>
              Set yourself up for success
            </p>
          </div>
          <button
            onClick={() => navigate('/decision-history')}
            style={{
              padding: '12px 24px',
              backgroundColor: 'transparent',
              border: '2px solid #F08571',
              borderRadius: '8px',
              color: '#F08571',
              fontWeight: '600',
              cursor: 'pointer',
              fontSize: '14px',
              transition: 'all 0.2s',
              flexShrink: 0,
              marginLeft: '16px',
            }}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = '#FEE5DE';
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = 'transparent';
            }}
          >
            My Plans
          </button>
        </div>

        <div style={{ marginBottom: '32px' }}>
          <div style={{ width: '100%', height: '4px', backgroundColor: '#e5e5e5', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: '100%', backgroundColor: '#F08571', transition: 'width 0.3s ease' }} />
          </div>
        </div>

        <div style={{ marginBottom: '32px', display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }}>
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
                outline: 'none',
                resize: 'vertical',
              }}
              onFocus={(e) => (e.target.style.borderColor = '#F08571')}
              onBlur={(e) => (e.target.style.borderColor = '#e5e5e5')}
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
                outline: 'none',
                resize: 'vertical',
              }}
              onFocus={(e) => (e.target.style.borderColor = '#F08571')}
              onBlur={(e) => (e.target.style.borderColor = '#e5e5e5')}
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
                outline: 'none',
                resize: 'vertical',
              }}
              onFocus={(e) => (e.target.style.borderColor = '#F08571')}
              onBlur={(e) => (e.target.style.borderColor = '#e5e5e5')}
            />
          </div>
        </div>

        {saved && (
          <div style={{ textAlign: 'center', color: '#5ECCC0', fontSize: '14px', fontWeight: '600', marginBottom: '16px' }}>
            ✓ Daily plan saved
          </div>
        )}

        <SaveDiscardButtons
          onSave={handleSaveAsDraft}
          onDiscard={() => {
            clearForm();
            navigate('/welcome');
          }}
          isSaving={isSaving}
          canNext={true}
          saveLabel="Save Plan"
          discardLabel="Back"
        />
      </div>
    </div>
  );
}
