import { useContext, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { discardDecisionDraft } from '../lib/discardDraft';
import { clearProgress } from '../lib/saveProgress';
import { useDraft } from '../lib/drafts';
import FormTool from './toolFocus/FormTool';
import DiscardDialog from '../components/ui/DiscardDialog';
import NameDialog from '../components/ui/NameDialog';
import { Loading, TextBox, AddButton, IconButton, Choice, Counter, Row, Rows, useToast } from '../components/design';

// The saved values stay as they were; the answers people tap are full
// sentences in their own voice (rule 29aa, Tim, 9 Nov).
const ACTIONS = ['Stop', 'Automate', 'Delegate', 'Defer'];
// The approved Time audit's words (Tim approved it on 3 Nov; Claude's call of 10 Nov), so nothing changes again when it replaces this page.
const ACTION_WORDS = { Stop: 'Stop it', Automate: 'Automate it', Delegate: 'Delegate it', Defer: 'Do it later' };
const MAX_ACTIVITY = 80;
const MAX_LONG = 2000;


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
  const toast = useToast();

  // Typing survives a refresh or a closed tab (Tim, 26 Oct): one draft
  // per saved audit, and one for a new audit.
  const { clear: clearDraft } = useDraft({
    userId: user?.id,
    name: `stop-doing-audit:${location.state?.decisionId || 'new'}`,
    value: { items, firstAction, actionHow, timeUse },
    ready: !isLoading,
    onRestore: (v) => {
      if (Array.isArray(v.items) && v.items.length) setItems(v.items);
      setFirstAction(v.firstAction ?? '');
      setActionHow(v.actionHow || '');
      setTimeUse(v.timeUse || '');
    },
  });

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
      // decisions carries two draft markers and this tool only ever
      // wrote status, leaving draft at its default false even on a
      // genuine draft row (audit item 10.2). Every other
      // decisions-table tool writes both together, so this now does
      // too - the list pages check either marker, so nothing else
      // changes; it just stops the data contradicting itself.
      draft: status === 'draft',
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
      clearDraft();
      navigate('/time-audit/summary', { state: { decisionId: savedId, toast: `Saved as ${name}.` } });
    } catch (error) {
      console.error('[StopDoingAudit] save failed:', error);
      setSaveError('That didn’t save. Check your connection and try again.');
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
      clearDraft();
      toast.show('Draft saved.');
      navigate('/my-plans');
    } catch (error) {
      console.error('[StopDoingAudit] draft save failed:', error);
      setSaveError('That didn’t save. Check your connection and try again.');
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
    clearDraft();
    navigate('/my-plans', { state: { toast: 'Discarded.' } });
  };

  if (isLoading) {
    return (
      <div className="ui-root">
        <Loading label="Loading your audit" className="ds-loading--page" />
      </div>
    );
  }

  return (
    <div className="ui-root">
      <FormTool
        name="Time audit"
        question="Which tasks and activities are stealing your time?"
        hint="Name up to five, with roughly how many hours each takes a week."
        onNext={() => { if (!isSaving) handleFinish(); }}
        nextLabel="Finish"
        saveError={saveError}
        onSaveDraft={() => { if (!isSaving) handleSaveDraft(); }}
        onDiscard={() => setDiscardOpen(true)}
        closeTo="/personal/plan"
        className="ta-tool"
      >
        {items.map((item, index) => (
          <div className="ta-item" key={item.id}>
            <div className="ft-row">
              <TextBox
                lines="one"
                placeholder="Type here"
                ariaLabel={`Activity ${index + 1}`}
                value={item.activity}
                onChange={(v) => updateItem(item.id, 'activity', v)}
                maxLength={MAX_ACTIVITY}
              />
              {items.length > 1 && <IconButton label={`Remove activity ${index + 1}`} onClick={() => removeItem(item.id)} />}
            </div>
            <div className="ta-hours">
              <Counter
                value={parseInt(item.timePerWeek, 10) || 0}
                min={0}
                max={999}
                label={`Hours a week for activity ${index + 1}`}
                lessLabel="Fewer hours"
                moreLabel="More hours"
                onChange={(v) => updateItem(item.id, 'timePerWeek', String(v))}
              />
              <span className="ta-unit">hours a week</span>
            </div>
          </div>
        ))}
        {items.length < 5 && (
          <AddButton onClick={addItem}>
            Add activity
          </AddButton>
        )}

        <Rows className="ta-total">
          <Row name="Total time to reclaim" value={`${totalHours} ${totalHours === 1 ? 'hour' : 'hours'} a week`} />
        </Rows>

        {namedItems.length > 0 && (
          <>
            <div className="ft-label ta-label">What will you do about each one?</div>
            {namedItems.map((item) => (
              <div className="tsa-activity-block" key={item.id}>
                <p className="tsa-activity-name">{item.activity}</p>
                <Choice
                  ariaLabel={`Action for ${item.activity}`}
                  options={ACTIONS.map((action) => ({ value: action, label: ACTION_WORDS[action] }))}
                  value={item.action}
                  onChange={(action) => updateItem(item.id, 'action', action)}
                />
              </div>
            ))}

            <div className="plan-field">
              <Choice
                form="dropdown"
                label="Which one will you take action on first?"
                placeholder="Choose an activity..."
                options={namedItems.map((item) => ({ value: String(item.id), label: `${item.activity} (${ACTION_WORDS[item.action] || item.action || 'no action selected'})` }))}
                value={firstAction === '' ? null : String(firstAction)}
                onChange={(value) => { setFirstAction(namedItems.find((item) => String(item.id) === value)?.id ?? ''); setFirstActionError(''); }}
              />
              {firstActionItem && <p className="ft-help ta-saves">{`Saves ${parseInt(firstActionItem.timePerWeek, 10) || 0} hours a week`}</p>}
              {firstActionError && <p className="plan-save-error" role="alert">{firstActionError}</p>}
            </div>

            <div className="plan-field">
              <TextBox id="tsa-how" label="How specifically will you take action on this?" lines="many" placeholder="Type here" value={actionHow} onChange={setActionHow} maxLength={MAX_LONG} />
            </div>

            <div className="plan-field">
              <TextBox id="tsa-use" label="What will you do with the time instead?" lines="many" placeholder="Type here" value={timeUse} onChange={setTimeUse} maxLength={MAX_LONG} />
            </div>
          </>
        )}

      </FormTool>

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
    </div>
  );
}
