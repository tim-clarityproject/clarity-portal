import { useState, useContext, useEffect } from 'react';
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
import pageText from '../content/pageText';
import PageHeading from '../components/PageHeading';

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
  // Each If.../Then I will pair should stay the same height as each
  // other (the shorter one stretching to match) - the two boxes report
  // their own natural height here, and the larger of the pair is fed
  // back down as a forced minimum.
  const [pairHeights, setPairHeights] = useState({});
  const { message, showToast } = useToast();

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
        clearProgress();
        navigate('/my-plans');
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
    navigate('/my-plans');
  };

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
          <PageHeading pageKey="ifThenPlanning" title="If-Then plan" overline="" rule={false} />
        </div>

        <div className="plan-field">
          <label htmlFor="ift-situation">Which situation are you concerned about?</label>
          <AutoGrowTextarea
            id="ift-situation"
            className="plan-input"
            placeholder="Type here"
            value={situation}
            onChange={setSituation}
          />
        </div>

        {items.map((item, index) => {
          const ifKey = `${item.id}-if`;
          const thenKey = `${item.id}-then`;
          const pairMax = Math.max(pairHeights[ifKey] || 0, pairHeights[thenKey] || 0) || undefined;
          return (
            <div className="plan-sc-row" key={item.id}>
              <div className="plan-sc-pair">
                <div>
                  <label htmlFor={`ift-if-${item.id}`}>If...</label>
                  <AutoGrowTextarea
                    id={`ift-if-${item.id}`}
                    singleLine
                    className="plan-input"
                    placeholder="Type here"
                    value={item.ifCondition}
                    onChange={(v) => changeItem(item.id, 'ifCondition', v)}
                    minPixelHeight={pairMax}
                    onHeightChange={(h) => setPairHeights((prev) => (prev[ifKey] === h ? prev : { ...prev, [ifKey]: h }))}
                  />
                </div>
                <div>
                  <label htmlFor={`ift-then-${item.id}`}>Then I will</label>
                  <AutoGrowTextarea
                    id={`ift-then-${item.id}`}
                    singleLine
                    className="plan-input"
                    placeholder="Type here"
                    value={item.thenAction}
                    onChange={(v) => changeItem(item.id, 'thenAction', v)}
                    minPixelHeight={pairMax}
                    onHeightChange={(h) => setPairHeights((prev) => (prev[thenKey] === h ? prev : { ...prev, [thenKey]: h }))}
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
