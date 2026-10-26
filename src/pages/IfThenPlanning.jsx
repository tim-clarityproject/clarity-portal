import { useState, useContext, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { discardDecisionDraft } from '../lib/discardDraft';
import { clearProgress } from '../lib/saveProgress';
import DesignHeader from '../components/DesignHeader';
import PhoneActionBar from '../components/ui/PhoneActionBar';
import { DiscardLink } from '../components/ui/DiscardLink';
import DiscardDialog from '../components/ui/DiscardDialog';
import NameDialog from '../components/ui/NameDialog';
import pageText from '../content/pageText';
import { PageHeader, SaveStatus, TextBox, AddButton, Button, useToast } from '../components/design';
import { clearDraft as forgetDraft, useDraft } from '../lib/drafts';
import { saveDecisionOrQueue } from '../lib/decisionSave';
import { useQueuedSave } from '../lib/syncQueue';

const MAX_NAME_LENGTH = 60;

function BinIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 4.5h11M6 4.5V3h4v1.5M4 4.5l.6 8h6.8l.6-8M6.8 7v3.5M9.2 7v3.5" />
    </svg>
  );
}

// Smallest sensible suggestion: the start of the situation text, cut to
// 60 characters (the old Save-as-draft named everything "If-Then
// Planning (Draft)" with no way to change it - see build summary).
function suggestNameFrom(situation) {
  const trimmed = (situation || '').trim();
  if (!trimmed) return 'New If-Then plan';
  return trimmed.length > MAX_NAME_LENGTH ? trimmed.slice(0, MAX_NAME_LENGTH) : trimmed;
}

export default function IfThenPlanning() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const [decisionId, setDecisionId] = useState(location.state?.decisionId || null);

  const [situation, setSituation] = useState('');
  const [items, setItems] = useState([{ id: 1, ifCondition: '', thenAction: '' }]);
  const [nextId, setNextId] = useState(2);
  const [currentTitle, setCurrentTitle] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [discardOpen, setDiscardOpen] = useState(false);
  const [nameDialog, setNameDialog] = useState(null); // null | 'finish' | 'draft'
  const toast = useToast();
  // A plan opened from My Plans is ready once it has loaded; a new one at once.
  const [loaded, setLoaded] = useState(!location.state?.decisionId);
  const [draftName, setDraftName] = useState(() => `if-then:${location.state?.decisionId || 'new'}`);
  const [syncState, markQueued] = useQueuedSave();
  // A double tap starts one save, not two.
  const savingRef = useRef(false);

  // Typing survives a refresh or a closed tab (Tim, 26 Oct).
  const { clear: clearDraft } = useDraft({
    userId: user?.id,
    name: draftName,
    value: { situation, items },
    ready: loaded,
    onRestore: (v) => {
      setSituation(v.situation || '');
      if (v.items?.length) {
        setItems(v.items);
        setNextId(Math.max(...v.items.map((i) => i.id || 0)) + 1);
      }
    },
  });

  // A save that waited on the device has reached the server: the draft
  // can go. (A refused one keeps it, so the typing comes back.)
  useEffect(() => {
    if (syncState === 'saved') clearDraft();
  }, [syncState, clearDraft]);

  useEffect(() => {
    if (!decisionId || !user || loaded) return;
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
        console.error('[IfThenPlanning] load failed:', error);
        setLoaded(true);
        return;
      }
      if (data?.title) setCurrentTitle(data.title);
      const formData = data?.form_data || {};
      if (formData.situation) setSituation(formData.situation);
      if (formData.items?.length) {
        setItems(formData.items);
        setNextId(Math.max(...formData.items.map((i) => i.id || 0)) + 1);
      }
      setLoaded(true);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decisionId, user?.id]);

  const addItem = () => {
    setItems([...items, { id: nextId, ifCondition: '', thenAction: '' }]);
    setNextId(nextId + 1);
  };
  const removeItem = (id) => {
    if (items.length > 1) setItems(items.filter((i) => i.id !== id));
  };
  const changeItem = (id, field, value) => {
    setItems(items.map((i) => (i.id === id ? { ...i, [field]: value } : i)));
  };

  const persist = async (draft, name) => {
    const payload = {
      form_data: { situation, items },
      title: name,
      draft,
      status: draft ? 'draft' : 'completed',
      updated_at: new Date().toISOString(),
    };

    // Offline, it is kept on the device and sent when the connection is
    // back ("Will sync", then "Saved").
    const result = await saveDecisionOrQueue({ userId: user.id, decisionId, toolType: 'if_then_planning', payload });
    setDecisionId(result.id);
    // A new plan now has its id (made on the device when offline): the
    // page's history and its draft follow it, so a refresh and a second
    // save update this plan rather than make another.
    if (!location.state?.decisionId) {
      navigate(location.pathname, { replace: true, state: { ...location.state, decisionId: result.id } });
      forgetDraft(user.id, draftName);
      setDraftName(`if-then:${result.id}`);
    }
    // The draft stays until the server has it: a save waiting on the
    // device is cleared once it has gone (below), and kept if refused.
    if (result.status === 'queued') markQueued(result.qid);
    else clearDraft();
    return result;
  };

  const handleNameConfirm = async (name) => {
    if (!user || isSaving || savingRef.current) return;
    savingRef.current = true;
    const mode = nameDialog;
    setSaveError('');
    setIsSaving(true);
    try {
      const saved = await persist(mode === 'draft', name);
      const savedId = saved.id;
      setCurrentTitle(name);
      setNameDialog(null);
      if (saved.status === 'queued') {
        // Kept on the device for now: stay here, showing "Will sync".
        clearProgress();
      } else if (mode === 'draft') {
        toast.show(`Draft saved as ${name}.`);
        clearProgress();
        navigate('/my-plans');
      } else {
        clearProgress();
        navigate('/if-then-planning-summary', { state: { decisionId: savedId, toast: `Saved as ${name}.` } });
      }
    } catch (error) {
      console.error('[IfThenPlanning] save failed:', error);
      setNameDialog(null);
      setSaveError('That didn’t save. Check your connection and try again.');
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  // Deletes the saved row only if it is still a draft - a completed
  // plan is never deleted by walking away from it. The condition lives
  // in the query (see discardDraft.js), so a completed row matches
  // nothing even though this page does not track its status (patch D1).
  const handleDiscard = async () => {
    setDiscardOpen(false);
    if (decisionId) {
      try {
        await discardDecisionDraft(user.id, decisionId);
      } catch (error) {
        console.error('[IfThenPlanning] draft delete on discard failed:', error);
      }
    }
    clearDraft();
    navigate('/my-plans');
  };

  const suggestedName = currentTitle || suggestNameFrom(situation);

  const actionButtons = (
    <>
      <Button variant="primary" disabled={isSaving} onClick={() => setNameDialog('finish')}>Finish</Button>
      <Button variant="outline" disabled={isSaving} onClick={() => setNameDialog('draft')}>Save as draft</Button>
    </>
  );

  return (
    <div className="ui-root">
      <DesignHeader />

      <div className="plan-page plan-page--form">
        <div className="plan-header">
          <PageHeader title="If-Then plan" info={pageText.ifThenPlanning} />
        </div>

        <div className="plan-field">
          <TextBox
            id="ift-situation"
            label="Which situation are you concerned about?"
            lines="many"
            focusMode
            who="me"
            placeholder="Type here"
            value={situation}
            onChange={setSituation}
          />
        </div>

        {items.map((item, index) => {
          return (
            <div className="plan-sc-row" key={item.id}>
              <div className="plan-sc-pair">
                <div>
                  <TextBox
                    id={`ift-if-${item.id}`}
                    label="If..."
                    lines="one"
                    placeholder="Type here"
                    value={item.ifCondition}
                    onChange={(v) => changeItem(item.id, 'ifCondition', v)}
                  />
                </div>
                <div>
                  <TextBox
                    id={`ift-then-${item.id}`}
                    label="Then I will"
                    lines="one"
                    placeholder="Type here"
                    value={item.thenAction}
                    onChange={(v) => changeItem(item.id, 'thenAction', v)}
                  />
                </div>
              </div>
              <button
                type="button"
                className="plan-bin-btn"
                aria-label={`Remove scenario ${index + 1}`}
                disabled={items.length === 1}
                onClick={() => removeItem(item.id)}
              >
                <BinIcon />
              </button>
            </div>
          );
        })}
        <AddButton onClick={addItem}>
          Add scenario
        </AddButton>

        {saveError && <p className="plan-save-error" role="alert">{saveError}</p>}
        <SaveStatus state={syncState} />

        <div className="plan-actions plan-actions--desktop">{actionButtons}</div>

        <div className="plan-discard-row">
          <DiscardLink onClick={() => setDiscardOpen(true)} />
        </div>
      </div>

      <PhoneActionBar>{actionButtons}</PhoneActionBar>

      <NameDialog
        open={nameDialog !== null}
        title={nameDialog === 'draft' ? 'Name this draft' : 'Name this plan'}
        message="Give it a name so you can find it in My plans."
        suggestedName={suggestedName}
        onConfirm={handleNameConfirm}
        onCancel={() => setNameDialog(null)}
      />

      <DiscardDialog
        isOpen={discardOpen}
        title="Discard this plan?"
        message="Anything you have not saved will be lost."
        onKeep={() => setDiscardOpen(false)}
        onDiscard={handleDiscard}
      />
    </div>
  );
}
