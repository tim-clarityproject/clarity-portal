import { useContext, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { discardDecisionDraft } from '../lib/discardDraft';
import { clearProgress } from '../lib/saveProgress';
import DesignHeader from '../components/DesignHeader';
import PhoneActionBar from '../components/ui/PhoneActionBar';
import AutoGrowTextarea from '../components/ui/AutoGrowTextarea';
import { DiscardLink } from '../components/ui/DiscardLink';
import DiscardDialog from '../components/ui/DiscardDialog';
import NameDialog from '../components/ui/NameDialog';
import Toast from '../components/ui/Toast';
import useToast from '../hooks/useToast';

const ACTIONS = ['Stop', 'Automate', 'Delegate', 'Defer'];
const MAX_ACTIVITY = 80;
const MAX_LONG = 2000;

function BinIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 4.5h11M6 4.5V3h4v1.5M4 4.5l.6 8h6.8l.6-8M6.8 7v3.5M9.2 7v3.5" />
    </svg>
  );
}

let tempIdCounter = 0;
function tempId() {
  tempIdCounter += 1;
  return Date.now() * 1000 + tempIdCounter;
}

export default function StopDoingAudit() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const [decisionId, setDecisionId] = useState(location.state?.decisionId || null);

  const [items, setItems] = useState([{ id: tempId(), activity: '', timePerWeek: '', action: null }]);
  const [firstAction, setFirstAction] = useState('');
  const [actionHow, setActionHow] = useState('');
  const [timeUse, setTimeUse] = useState('');
  const [isLoading, setIsLoading] = useState(Boolean(location.state?.decisionId));
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [firstActionError, setFirstActionError] = useState('');
  const [discardOpen, setDiscardOpen] = useState(false);
  const [nameDialogOpen, setNameDialogOpen] = useState(false);
  // The saved title, so renaming an existing audit starts from its own
  // name instead of always suggesting "Reclaiming my time" (patch D1).
  const [currentTitle, setCurrentTitle] = useState('');
  const { message, showToast } = useToast();

  useEffect(() => {
    if (!decisionId || !user) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('decisions')
        .select('*')
        .eq('id', decisionId)
        .eq('user_id', user.id)
        .single();
      if (cancelled) return;
      if (error) {
        console.error('[StopDoingAudit] load failed:', error);
        setIsLoading(false);
        return;
      }
      if (data?.title) setCurrentTitle(data.title);
      const formData = data?.form_data || {};
      if (formData.items?.length) {
        setItems(formData.items);
        // Back-compat: old rows stored firstAction as the activity TEXT,
        // not its id - map it across once, on read.
        if (formData.firstAction) {
          const byId = formData.items.some((i) => i.id === formData.firstAction);
          if (byId) {
            setFirstAction(formData.firstAction);
          } else {
            const match = formData.items.find((i) => i.activity === formData.firstAction);
            setFirstAction(match ? match.id : '');
          }
        }
      }
      setActionHow(formData.actionHow || '');
      setTimeUse(formData.timeUse || '');
      setIsLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decisionId, user?.id]);

  const addItem = () => {
    if (items.length >= 5) return;
    setItems([...items, { id: tempId(), activity: '', timePerWeek: '', action: null }]);
  };

  const removeItem = (id) => {
    if (items.length <= 1) return;
    setItems(items.filter((item) => item.id !== id));
    if (firstAction === id) setFirstAction('');
  };

  const updateItem = (id, field, value) => {
    setItems(items.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  };

  const totalHours = items.reduce((sum, item) => sum + (parseInt(item.timePerWeek, 10) || 0), 0);
  const namedItems = items.filter((item) => item.activity.trim());
  const firstActionItem = items.find((item) => item.id === firstAction);

  const persist = async (name, status) => {
    const formData = { items, firstAction, actionHow, timeUse };
    const payload = {
      form_data: formData,
      title: name,
      status,
      updated_at: new Date().toISOString(),
    };
    if (decisionId) {
      const { data, error } = await supabase
        .from('decisions')
        .update(payload)
        .eq('id', decisionId)
        .eq('user_id', user.id)
        .select();
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Could not find this audit to update.');
      return decisionId;
    }
    const { data, error } = await supabase
      .from('decisions')
      .insert({ user_id: user.id, tool_type: 'stop_doing_audit', ...payload })
      .select();
    if (error) throw error;
    if (!data || data.length === 0) throw new Error('Save did not return an audit.');
    return data[0].id;
  };

  const handleFinishConfirmed = async (name) => {
    setNameDialogOpen(false);
    setIsSaving(true);
    setSaveError('');
    try {
      const savedId = await persist(name, 'completed');
      setDecisionId(savedId);
      clearProgress();
      navigate('/stop-doing-audit-summary', { state: { decisionId: savedId, toast: `Saved as ${name}.` } });
    } catch (error) {
      console.error('[StopDoingAudit] save failed:', error);
      setSaveError('Could not save - please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleFinish = () => {
    setFirstActionError('');
    if (namedItems.length === 0) {
      setSaveError('Name at least one activity first.');
      return;
    }
    if (firstActionItem && !firstActionItem.action) {
      setFirstActionError('Choose what you will do about it');
      return;
    }
    setSaveError('');
    setNameDialogOpen(true);
  };

  const handleSaveDraft = async () => {
    setIsSaving(true);
    setSaveError('');
    try {
      // Keeps whatever this audit is already called - it used to write
      // the literal "Reclaiming my time" every time, so saving a draft
      // silently renamed an audit the person had named themselves
      // (patch D1, same root cause as the empty name pop-up).
      const savedId = await persist(currentTitle || 'Reclaiming my time', 'draft');
      setDecisionId(savedId);
      showToast('Draft saved.');
    } catch (error) {
      console.error('[StopDoingAudit] draft save failed:', error);
      setSaveError('Could not save - please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // Deletes the saved row only if it is still a draft - a completed
  // audit is never deleted by walking away from it. The condition lives
  // in the query (see discardDraft.js), so a completed row matches
  // nothing even though this page does not track its status (patch D1).
  const handleDiscard = async () => {
    setDiscardOpen(false);
    if (decisionId) {
      try {
        await discardDecisionDraft(user.id, decisionId);
      } catch (error) {
        console.error('[StopDoingAudit] draft delete on discard failed:', error);
      }
    }
    navigate('/my-plans', { state: { toast: 'Discarded.' } });
  };

  if (isLoading) {
    return (
      <div className="ui-root">
        <DesignHeader />
        <div className="plan-page"><p className="ui-subtitle">Loading...</p></div>
      </div>
    );
  }

  const actionButtons = (
    <>
      <button type="button" className="ui-btn-primary" disabled={isSaving} onClick={handleFinish}>Finish</button>
      <button type="button" className="ui-btn-ghost" disabled={isSaving} onClick={handleSaveDraft}>Save as draft</button>
    </>
  );

  return (
    <div className="ui-root">
      <DesignHeader />

      <div className="plan-page plan-page--form">
        <div className="plan-header">
          <span className="plan-overline">Plan</span>
          <div className="ui-title">Time Allocation Audit</div>
          <p className="ui-subtitle">Identify time-sink activities and reclaim your time.</p>
        </div>

        <div className="plan-label-row">
          <span className="ui-section-heading">Which tasks and activities are stealing your time?</span>
        </div>

        {items.map((item, index) => (
          <div className="tsa-row" key={item.id}>
            <span className="tsa-num">{index + 1}.</span>
            <AutoGrowTextarea
              singleLine
              className="plan-input"
              placeholder="Type here"
              aria-label={`Activity ${index + 1}`}
              value={item.activity}
              onChange={(v) => updateItem(item.id, 'activity', v)}
              maxLength={MAX_ACTIVITY}
            />
            <div className="tsa-stepper">
              <button type="button" className="tsa-stepper-btn" aria-label="Fewer hours" onClick={() => updateItem(item.id, 'timePerWeek', String(Math.max(0, (parseInt(item.timePerWeek, 10) || 0) - 1)))}>−</button>
              <input
                type="number"
                min="0"
                max="999"
                inputMode="numeric"
                placeholder="0"
                value={item.timePerWeek}
                onChange={(e) => updateItem(item.id, 'timePerWeek', e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
              />
              <button type="button" className="tsa-stepper-btn" aria-label="More hours" onClick={() => updateItem(item.id, 'timePerWeek', String(Math.min(999, (parseInt(item.timePerWeek, 10) || 0) + 1)))}>+</button>
              <span className="tsa-hrs-label">hrs/wk</span>
            </div>
            <button type="button" className="plan-bin-btn" aria-label={`Remove activity ${index + 1}`} disabled={items.length <= 1} onClick={() => removeItem(item.id)}>
              <BinIcon />
            </button>
          </div>
        ))}
        {items.length < 5 && (
          <button type="button" className="plan-add-btn" onClick={addItem}>
            <span className="ui-cross ui-cross--sm" aria-hidden="true" />
            Add activity
          </button>
        )}

        <div className="tsa-total">
          <span>Total time to reclaim</span>
          <b>{totalHours} hours/week</b>
        </div>

        {namedItems.length > 0 && (
          <>
            <div className="plan-label-row">
              <span className="ui-section-heading">What will you do for each activity?</span>
            </div>
            {namedItems.map((item) => (
              <div className="tsa-activity-block" key={item.id}>
                <p className="tsa-activity-name">{item.activity}</p>
                <div className="tsa-pills" role="group" aria-label={`Action for ${item.activity}`}>
                  {ACTIONS.map((action) => (
                    <button
                      key={action}
                      type="button"
                      className="tsa-pill"
                      aria-pressed={item.action === action}
                      onClick={() => updateItem(item.id, 'action', action)}
                    >
                      {action}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            <div className="plan-field">
              <label htmlFor="tsa-first">Which one will you take action on first?</label>
              <select id="tsa-first" className="plan-input" value={firstAction} onChange={(e) => { setFirstAction(e.target.value); setFirstActionError(''); }}>
                <option value="">Choose an activity...</option>
                {namedItems.map((item) => (
                  <option key={item.id} value={item.id}>{item.activity} ({item.action || 'no action selected'})</option>
                ))}
              </select>
              {firstActionItem && <p className="tsa-saves">Saves {parseInt(firstActionItem.timePerWeek, 10) || 0} hrs/wk</p>}
              {firstActionError && <p className="plan-save-error" role="alert">{firstActionError}</p>}
            </div>

            <div className="plan-field">
              <label htmlFor="tsa-how">How specifically will you take action on this?</label>
              <AutoGrowTextarea id="tsa-how" className="plan-input" placeholder="Type here" value={actionHow} onChange={setActionHow} maxLength={MAX_LONG} />
            </div>

            <div className="plan-field">
              <label htmlFor="tsa-use">What will you do with the time instead?</label>
              <AutoGrowTextarea id="tsa-use" className="plan-input" placeholder="Type here" value={timeUse} onChange={setTimeUse} maxLength={MAX_LONG} />
            </div>
          </>
        )}

        {saveError && <p className="plan-save-error" role="alert">{saveError}</p>}

        <div className="plan-actions plan-actions--desktop">{actionButtons}</div>

        <div className="plan-discard-row">
          <DiscardLink onClick={() => setDiscardOpen(true)} />
        </div>
      </div>

      <PhoneActionBar>{actionButtons}</PhoneActionBar>

      <NameDialog
        open={nameDialogOpen}
        title="Name this audit"
        message="Give it a name so you can find it in My plans."
        suggestedName={currentTitle || 'Reclaiming my time'}
        onConfirm={handleFinishConfirmed}
        onCancel={() => setNameDialogOpen(false)}
      />

      <DiscardDialog
        isOpen={discardOpen}
        title="Discard this audit?"
        message="Anything you have not saved will be lost."
        onKeep={() => setDiscardOpen(false)}
        onDiscard={handleDiscard}
      />
      <Toast message={message} />
    </div>
  );
}
