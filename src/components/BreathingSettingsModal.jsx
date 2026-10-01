import { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import PopupShell from './PopupShell';

function Slider({ label, value, min, max, onChange }) {
  const percent = ((value - min) / (max - min)) * 100;
  return (
    <div className="breathing-slider-block">
      <div className="breathing-slider-head">
        <span className="breathing-slider-label">{label}</span>
        <span className="breathing-slider-value">{value} second{value !== 1 ? 's' : ''}</span>
      </div>
      <div className="breathing-slider-wrap">
        <div className="breathing-slider-track" />
        <div className="breathing-slider-fill" style={{ width: `${percent}%` }} />
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value, 10))}
          className="breathing-slider-input"
          aria-label={label}
        />
      </div>
      <div className="breathing-slider-range-note">{min} to {max} seconds</div>
    </div>
  );
}

export default function BreathingSettingsModal({ isOpen, onClose }) {
  const { user } = useContext(AuthContext);
  const [inhale, setInhale] = useState(4);
  const [hold, setHold] = useState(0);
  const [exhale, setExhale] = useState(6);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen || !user) return;

    const loadSettings = async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('breathing_settings')
          .eq('id', user.id)
          .single();

        if (data?.breathing_settings) {
          const settings = data.breathing_settings;
          setInhale(settings.inhale || 4);
          setHold(settings.hold || 0);
          setExhale(settings.exhale || 6);
        }
      } catch (e) {
        console.error('Error loading breathing settings:', e);
      }
    };

    loadSettings();
  }, [isOpen, user]);

  const handleSave = async () => {
    if (!user) return;

    setIsSaving(true);
    const settings = { inhale, hold, exhale };

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ breathing_settings: settings })
        .eq('id', user.id);

      if (error) {
        console.error('Error saving breathing settings:', error);
      }
    } catch (e) {
      console.error('Error saving breathing settings:', e);
    } finally {
      setIsSaving(false);
      onClose();
    }
  };

  return (
    <PopupShell isOpen={isOpen} onClose={onClose} titleId="breathing-settings-title">
      <style>{`
        .breathing-slider-block {
          margin-bottom: 24px;
        }

        .breathing-slider-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .breathing-slider-label {
          font-family: var(--font-body);
          font-weight: 500;
          font-size: 15px;
          color: var(--text);
        }

        .breathing-slider-value {
          font-family: var(--font-body);
          font-size: 15px;
          color: var(--text-2);
        }

        .breathing-slider-wrap {
          position: relative;
          height: 44px;
          display: flex;
          align-items: center;
          margin-top: 6px;
        }

        .breathing-slider-track {
          position: absolute;
          left: 0;
          right: 0;
          height: 2px;
          border-radius: 1px;
          background: var(--line);
          pointer-events: none;
        }

        .breathing-slider-fill {
          position: absolute;
          left: 0;
          height: 2px;
          border-radius: 1px;
          background: var(--coral);
          pointer-events: none;
        }

        /* src/styles/mobile.css has input, select { min-height: 44px;
           padding: 12px 16px !important; } at max-width: 768px. Padding
           on a range input would distort the track/thumb geometry
           entirely, so this needs its own !important to zero it out;
           .breathing-slider-input (0,1,0) already outranks the bare
           "input" selector (0,0,1) on specificity, but not on
           !important. */
        .breathing-slider-input {
          position: relative;
          width: 100%;
          height: 44px;
          margin: 0;
          padding: 0 !important;
          background: transparent;
          appearance: none;
          -webkit-appearance: none;
          cursor: pointer;
          z-index: 1;
        }

        .breathing-slider-input::-webkit-slider-runnable-track {
          background: transparent;
          height: 2px;
        }

        .breathing-slider-input::-webkit-slider-thumb {
          appearance: none;
          -webkit-appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: var(--coral);
          cursor: pointer;
          margin-top: -8px;
        }

        .breathing-slider-input::-moz-range-track {
          background: transparent;
          height: 2px;
          border: none;
        }

        .breathing-slider-input::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: var(--coral);
          border: none;
          cursor: pointer;
        }

        .breathing-slider-range-note {
          font-family: var(--font-body);
          font-size: 12px;
          color: var(--placeholder);
          margin-top: 4px;
        }

        .breathing-hold-label {
          font-family: var(--font-body);
          font-weight: 500;
          font-size: 15px;
          color: var(--text);
          margin-bottom: 12px;
        }
      `}</style>

      <h2 id="breathing-settings-title" className="popup-title">
        Breathing Settings
      </h2>
      <p className="popup-desc">
        Customise your breathing cycle. Always: inhale, hold (optional), exhale, repeat.
      </p>

      <Slider label="Inhale duration" value={inhale} min={1} max={10} onChange={setInhale} />
      <Slider label="Exhale duration" value={exhale} min={1} max={10} onChange={setExhale} />

      <div style={{ marginBottom: hold > 0 ? '24px' : 0 }}>
        <div className="breathing-hold-label">Hold duration</div>
        <div className="ui-segmented" role="group" aria-label="Hold duration">
          <button
            type="button"
            className={`ui-segmented-option${hold === 0 ? ' active' : ''}`}
            onClick={() => setHold(0)}
            aria-pressed={hold === 0}
          >
            No hold
          </button>
          <button
            type="button"
            className={`ui-segmented-option${hold > 0 ? ' active' : ''}`}
            onClick={() => setHold(1)}
            aria-pressed={hold > 0}
          >
            With hold
          </button>
        </div>
      </div>

      {hold > 0 && (
        <Slider label="Hold duration" value={hold} min={1} max={4} onChange={setHold} />
      )}

      <div className="popup-actions">
        <button type="button" className="ui-btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="ui-btn-primary"
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </PopupShell>
  );
}
