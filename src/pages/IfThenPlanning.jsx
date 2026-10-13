import { useState, useContext, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { clearProgress } from '../lib/saveProgress';
import DesignHeader from '../components/DesignHeader';
import PhoneActionBar from '../components/ui/PhoneActionBar';
import { DiscardLink } from '../components/ui/DiscardLink';
import DiscardDialog from '../components/ui/DiscardDialog';
import NameDialog from '../components/ui/NameDialog';
import Toast from '../components/ui/Toast';
import useToast from '../hooks/useToast';
import { useAutoExpandTextarea } from '../hooks/useAutoExpandTextarea';
import pageText from '../content/pageText';

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
  const { message, showToast } = useToast();

  const refSituation = useRef(null);
  useAutoExpandTextarea(refSituation, situation);

  useEffect(() => {
    if (!decisionId || !user) return;
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
        return;
      }
      if (data?.title) setCurrentTitle(data.title);
      const formData = data?.form_data || {};
      if (formData.situation) setSituation(formData.situation);
      if (formData.items?.length) {
        setItems(formData.items);
        setNextId(Math.max(...formData.items.map((i) => i.id || 0)) + 1);
      }
    })();
    return () => { cancelled = true; };
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

    if (decisionId) {
      const { data, error } = await supabase
        .from('decisions')
        .update(payload)
        .eq('id', decisionId)
        .eq('user_id', user.id)
        .select();
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Could not find this plan to update.');
      return decisionId;
    }

    const { data, error } = await supabase
      .from('decisions')
      .insert({ user_id: user.id, tool_type: 'if_then_planning', ...payload })
      .select();
    if (error) throw error;
    if (!data || data.length === 0) throw new Error('Save did not return a plan.');
    return data[0].id;
  };

  const handleNameConfirm = async (name) => {
    if (!user || isSaving) return;
    const mode = nameDialog;
    setSaveError('');
    setIsSaving(true);
    try {
      const savedId = await persist(mode === 'draft', name);
      setCurrentTitle(name);
      setNameDialog(null);
      if (mode === 'draft') {
        setDecisionId(savedId);
        showToast(`Draft saved as ${name}.`);
      } else {
        clearProgress();
        navigate('/if-then-planning-summary', { state: { decisionId: savedId, toast: `Saved as ${name}.` } });
      }
    } catch (error) {
      console.error('[IfThenPlanning] save failed:', error);
      setNameDialog(null);
      setSaveError('Could not save - please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscard = () => {
    setDiscardOpen(false);
    navigate('/my-plans');
  };

  const page = pageText.ifThenPlanning;
  const suggestedName = currentTitle || suggestNameFrom(situation);

  const actionButtons = (
    <>
      <button type="button" className="ui-btn-primary" disabled={isSaving} onClick={() => setNameDialog('finish')}>Finish</button>
      <button type="button" className="ui-btn-ghost" disabled={isSaving} onClick={() => setNameDialog('draft')}>Save as draft</button>
    </>
  );

  return (
    <div className="ui-root">
      <DesignHeader />

      <div className="plan-page plan-page--form">
        <div className="plan-header">
          <div className="ui-title">If-Then plan</div>
          <p className="ui-subtitle">{page.subtitle}</p>
        </div>

        <div className="plan-field">
          <label htmlFor="ift-situation">Which situation are you concerned about?</label>
          <textarea
            id="ift-situation"
            ref={refSituation}
            className="plan-input"
            placeholder="Type here"
            value={situation}
            onChange={(e) => setSituation(e.target.value)}
          />
        </div>

        {items.map((item, index) => (
          <div className="plan-sc-row" key={item.id}>
            <div className="plan-sc-pair">
              <div>
                <label htmlFor={`ift-if-${item.id}`}>If...</label>
                <input
                  id={`ift-if-${item.id}`}
                  className="plan-input"
                  placeholder="Type here"
                  value={item.ifCondition}
                  onChange={(e) => changeItem(item.id, 'ifCondition', e.target.value)}
                />
              </div>
              <div>
                <label htmlFor={`ift-then-${item.id}`}>Then I will</label>
                <input
                  id={`ift-then-${item.id}`}
                  className="plan-input"
                  placeholder="Type here"
                  value={item.thenAction}
                  onChange={(e) => changeItem(item.id, 'thenAction', e.target.value)}
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
        ))}
        <button type="button" className="plan-add-btn" onClick={addItem}>
          <span className="ui-cross ui-cross--sm" aria-hidden="true" />
          Add scenario
        </button>

        {saveError && <p className="plan-save-error" role="alert">{saveError}</p>}

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
      <Toast message={message} />
    </div>
  );
}
