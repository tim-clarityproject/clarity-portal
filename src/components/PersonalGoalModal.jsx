import { useState, useContext, useEffect } from 'react';
import { AuthContext } from '../context/AuthContext';
import { MissionContext } from '../context/MissionContext';
import PopupShell from './PopupShell';
import { TextBox } from './design';

export const MAX_GOAL_LENGTH = 70;

export default function PersonalGoalModal({ isOpen, onClose, currentGoal, onGoalSaved }) {
  const { user } = useContext(AuthContext);
  const { updateMission } = useContext(MissionContext);
  const [goal, setGoal] = useState(currentGoal);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    setGoal(currentGoal);
    setSaveError('');
  }, [currentGoal, isOpen]);

  const handleSave = async () => {
    if (!user || !goal.trim()) return;

    setSaveError('');
    setIsSaving(true);
    try {
      await updateMission(goal.trim());
      onGoalSaved(goal.trim());
      onClose();
    } catch (error) {
      console.error('[PersonalGoalModal] save failed:', error);
      setSaveError('Could not save your mission. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <PopupShell isOpen={isOpen} onClose={onClose} titleId="edit-mission-title">
      <h2 id="edit-mission-title" className="popup-title">
        Edit Your Mission
      </h2>
      <p className="popup-desc">
        This will be displayed at the top of your screen to keep you focused and inspired.
      </p>

      <TextBox
        ariaLabel="Your mission"
        who="me"
        value={goal}
        onChange={(v) => setGoal(v.slice(0, MAX_GOAL_LENGTH))}
        placeholder="Type here"
        maxLength={MAX_GOAL_LENGTH}
      />

      {saveError && <p className="plan-save-error" role="alert">{saveError}</p>}

      <div className="popup-actions">
        <button type="button" className="ui-btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="ui-btn-primary"
          onClick={handleSave}
          disabled={!goal.trim() || isSaving}
        >
          {isSaving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </PopupShell>
  );
}
