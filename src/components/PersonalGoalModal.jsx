import { useState, useContext, useEffect } from 'react';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

const MAX_GOAL_LENGTH = 50;

export default function PersonalGoalModal({ isOpen, onClose, currentGoal, onGoalSaved }) {
  const { user } = useContext(AuthContext);
  const [goal, setGoal] = useState(currentGoal);
  const [isSaving, setIsSaving] = useState(false);

  const charCount = goal.length;
  const isOverLimit = charCount > MAX_GOAL_LENGTH;

  useEffect(() => {
    setGoal(currentGoal);
  }, [currentGoal, isOpen]);

  const handleSave = async () => {
    if (!user || !goal.trim()) return;

    setIsSaving(true);
    try {
      console.log('[PersonalGoalModal] handleSave: user =', user.id, 'goal =', goal.trim());
      const { data, error } = await supabase
        .from('profiles')
        .update({ personal_goal: goal.trim() })
        .eq('id', user.id)
        .select();

      console.log('[PersonalGoalModal] UPDATE result: data =', data, 'error =', error);
      if (error) throw error;
      if (!data || data.length === 0) {
        console.warn('[PersonalGoalModal] UPDATE matched 0 rows for user', user.id);
        alert('Failed to save goal - no rows updated');
        setIsSaving(false);
        return;
      }

      console.log('[PersonalGoalModal] Goal saved successfully');
      onGoalSaved(goal.trim());
      onClose();
    } catch (error) {
      console.error('[PersonalGoalModal] Error saving goal:', error);
      alert('Failed to save goal: ' + (error.message || 'Unknown error'));
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
      }}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '40px 32px',
          maxWidth: '500px',
          width: '90%',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.1)',
        }}
      >
        <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#333', margin: '0 0 12px 0' }}>
          Edit Your Purpose
        </h2>
        <p style={{ fontSize: '14px', color: '#666', margin: '0 0 24px 0', lineHeight: '1.6' }}>
          This will be displayed at the top of your screen to keep you focused and inspired.
        </p>

        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value.slice(0, MAX_GOAL_LENGTH))}
          placeholder="Type here"
          maxLength={MAX_GOAL_LENGTH}
          autoFocus
          style={{
            width: '100%',
            padding: '12px 16px',
            border: '2px solid ' + (isOverLimit ? '#F08571' : '#e5e5e5'),
            borderRadius: '8px',
            fontSize: '14px',
            fontFamily: 'inherit',
            resize: 'vertical',
            minHeight: '80px',
            boxSizing: 'border-box',
            transition: 'border-color 0.2s',
          }}
          onFocus={(e) => !isOverLimit && (e.target.style.borderColor = '#F08571')}
          onBlur={(e) => e.target.style.borderColor = isOverLimit ? '#F08571' : '#e5e5e5'}
        />

        {/* Character Counter */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
          <div style={{ fontSize: '12px', color: isOverLimit ? '#F08571' : '#999' }}>
            {charCount}/{MAX_GOAL_LENGTH} characters
          </div>
          {isOverLimit && (
            <span style={{ fontSize: '12px', color: '#F08571', fontWeight: '600' }}>
              Limit exceeded
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: '12px', marginTop: '24px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 20px',
              backgroundColor: 'white',
              border: '2px solid #e5e5e5',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '600',
              color: '#333',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#d0d0d0';
              e.currentTarget.style.backgroundColor = '#fafafa';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#e5e5e5';
              e.currentTarget.style.backgroundColor = 'white';
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!goal.trim() || isSaving || isOverLimit}
            style={{
              padding: '10px 20px',
              backgroundColor: (goal.trim() && !isOverLimit) ? '#F08571' : '#d9d9d9',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '600',
              color: 'white',
              cursor: (goal.trim() && !isOverLimit) ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              if (goal.trim() && !isOverLimit) {
                e.currentTarget.style.backgroundColor = '#e07560';
              }
            }}
            onMouseLeave={(e) => {
              if (goal.trim() && !isOverLimit) {
                e.currentTarget.style.backgroundColor = '#F08571';
              }
            }}
            title={isOverLimit ? 'Goal exceeds character or word limit' : ''}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
