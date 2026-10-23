import { useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { LIMITS, formatVersion, loadLatestVersion, previewNextVersion, recordVersionAfterSave, validatePlan } from '../lib/missionPlan';
import DesignHeader from '../components/DesignHeader';
import pageText from '../content/pageText';
import PhoneActionBar from '../components/ui/PhoneActionBar';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import SavingOverlay from '../components/ui/SavingOverlay';
import { DiscardLink } from '../components/ui/DiscardLink';
import DiscardDialog from '../components/ui/DiscardDialog';
import { Crosshair, Loading, PageHeader, TextBox, TextField, Button, SegmentedControl } from '../components/design';

const STRATEGY_INFO = "A strategy is the big-picture approach you take to achieve your mission. It's your overall direction, how you'll tackle things in a consistent, thoughtful way. Unlike tactics, which happen day-to-day, your strategies don't change frequently. They're the foundation that guides your daily actions.";
const TACTIC_INFO = 'A tactic is a specific, repeatable action you do regularly to carry out your strategy. These are the everyday, concrete things you actually do: the habits, routines, and practices that bring your strategies to life. Multiple tactics usually work together to execute one strategy.';

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
  return `temp-${Date.now()}-${tempIdCounter}`;
}

// Bigger steps for bigger numbers (mock-up's own stepBy()) - a target
// of 100,000 would take forever to reach one at a time.
function stepBy(value) {
  const n = Math.max(1, Math.abs(value));
  return Math.max(1, 10 ** (Math.floor(Math.log10(n)) - 1));
}

export default function PersonalOperatingPlanEdit() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const missionId = location.state?.missionId || null;
  const isNew = location.state?.isNew || !missionId;

  const [missionTitle, setMissionTitle] = useState('');
  const [strategies, setStrategies] = useState([]);
  const [baselineVersion, setBaselineVersion] = useState(null);
  const [isLoading, setIsLoading] = useState(!isNew);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [fieldError, setFieldError] = useState(null); // { field, message }
  const [discardOpen, setDiscardOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(null); // 'strategy' | 'tactic' | null
  const [deleteTarget, setDeleteTarget] = useState(null); // { kind: 'strategy'|'tactic', sIndex, tIndex }
  const [draftRestored, setDraftRestored] = useState(false);
  const [draftDismissed, setDraftDismissed] = useState(false);

  const draftKey = missionId ? `clarity-pplan-draft-${missionId}` : 'clarity-pplan-draft-new';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!missionId || !user) {
        setIsLoading(false);
        return;
      }
      try {
        const { data: mission } = await supabase
          .from('missions')
          .select('*')
          .eq('id', missionId)
          .eq('user_id', user.id)
          .is('archived_at', null)
          .single();

        if (cancelled) return;

        if (mission) {
          setMissionTitle(mission.title);

          const { data: strategiesData } = await supabase
            .from('strategies')
            .select('*')
            .eq('mission_id', missionId)
            .order('sort_order', { ascending: true });

          if (strategiesData) {
            const withTactics = await Promise.all(
              strategiesData.map(async (strategy) => {
                const { data: tactics } = await supabase
                  .from('tactics')
                  .select('*')
                  .eq('strategy_id', strategy.id)
                  .order('sort_order', { ascending: true });
                return { ...strategy, tactics: tactics || [] };
              })
            );
            if (!cancelled) setStrategies(withTactics);
          }
        }

        try {
          const latest = await loadLatestVersion(missionId);
          if (!cancelled) setBaselineVersion(latest);
        } catch (error) {
          console.error('[PlanEdit] version lookup failed:', error);
        }
      } catch (error) {
        console.error('[PlanEdit] load failed:', error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missionId, user?.id]);

  // Draft restore is visible (prompt 9 fixes the old silent restore):
  // the banner below names the date and offers "Discard them" instead
  // of quietly swapping in sessionStorage content.
  const [pendingDraft, setPendingDraft] = useState(null);
  useEffect(() => {
    if (isLoading || draftRestored) return;
    try {
      const raw = sessionStorage.getItem(draftKey);
      if (raw) {
        const draft = JSON.parse(raw);
        setPendingDraft(draft);
      }
    } catch (error) {
      console.error('[PlanEdit] draft read failed:', error);
    }
    setDraftRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, draftRestored]);

  const applyDraft = () => {
    if (!pendingDraft) return;
    setMissionTitle(pendingDraft.missionTitle || '');
    setStrategies(pendingDraft.strategies || []);
    setPendingDraft(null);
  };

  const discardDraft = () => {
    try { sessionStorage.removeItem(draftKey); } catch { /* ignore */ }
    setPendingDraft(null);
    setDraftDismissed(true);
  };

  // Autosave to sessionStorage (debounced) while editing.
  useEffect(() => {
    if (isLoading || pendingDraft) return;
    const timeout = setTimeout(() => {
      try {
        sessionStorage.setItem(draftKey, JSON.stringify({ missionTitle, strategies, timestamp: Date.now() }));
      } catch (error) {
        console.error('[PlanEdit] draft save failed:', error);
      }
    }, 1000);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missionTitle, strategies, isLoading, pendingDraft]);

  const preview = useMemo(() => previewNextVersion(baselineVersion, missionTitle, strategies), [baselineVersion, missionTitle, strategies]);
  const previewLine = preview.changeType
    ? `Saving creates ${formatVersion(preview.major, preview.minor)}.`
    : 'No changes to save yet.';

  const addStrategy = () => {
    setStrategies([...strategies, { id: tempId(), name: '', description: '', tactics: [], isNew: true }]);
  };

  const updateStrategy = (index, field, value) => {
    const updated = [...strategies];
    updated[index] = { ...updated[index], [field]: value };
    setStrategies(updated);
  };

  const confirmDeleteStrategy = () => {
    setStrategies(strategies.filter((_, i) => i !== deleteTarget.sIndex));
    setDeleteTarget(null);
  };

  const addTactic = (sIndex) => {
    const updated = [...strategies];
    updated[sIndex] = {
      ...updated[sIndex],
      tactics: [...updated[sIndex].tactics, { id: tempId(), action: '', type: 'tickable', is_done: false, isNew: true }],
    };
    setStrategies(updated);
  };

  const updateTactic = (sIndex, tIndex, field, value) => {
    const updated = [...strategies];
    const tactics = [...updated[sIndex].tactics];
    tactics[tIndex] = { ...tactics[tIndex], [field]: value };
    updated[sIndex] = { ...updated[sIndex], tactics };
    setStrategies(updated);
  };

  const confirmDeleteTactic = () => {
    const updated = [...strategies];
    updated[deleteTarget.sIndex] = {
      ...updated[deleteTarget.sIndex],
      tactics: updated[deleteTarget.sIndex].tactics.filter((_, i) => i !== deleteTarget.tIndex),
    };
    setStrategies(updated);
    setDeleteTarget(null);
  };

  const savePlan = async () => {
    const problem = validatePlan(missionTitle, strategies);
    if (problem) {
      setFieldError(problem);
      setSaveError('');
      return;
    }
    setFieldError(null);
    setSaveError('');
    setIsSaving(true);
    try {
      let currentMissionId = missionId;

      if (isNew || !currentMissionId) {
        const { data: mission, error } = await supabase
          .from('missions')
          .insert([{ user_id: user.id, title: missionTitle }])
          .select()
          .single();
        if (error) throw error;
        currentMissionId = mission.id;
        await supabase.from('profiles').update({ personal_goal: missionTitle }).eq('id', user.id);
      } else {
        const [{ error: missionError }] = await Promise.all([
          supabase.from('missions').update({ title: missionTitle }).eq('id', currentMissionId),
          supabase.from('profiles').update({ personal_goal: missionTitle }).eq('id', user.id),
        ]);
        if (missionError) throw missionError;
      }

      // Batched instead of one request per strategy/tactic (the old
      // code awaited a separate insert/update/delete for every single
      // row, one at a time - for a plan with, say, 4 strategies and 10
      // tactics that was 25-30+ sequential round trips, each one
      // waiting for the last to finish before starting). Deletes are
      // one .in(...) call per table; existing rows are one .upsert(...)
      // call per table (PostgREST only SETs the columns actually
      // included in the payload, so current_value/is_done - never part
      // of this payload - are left untouched, exactly like the old
      // per-row .update() did); only genuinely new rows still need
      // individual handling, and even those are one batched .insert()
      // per table. Net effect: total requests for strategies+tactics
      // drops from O(rows) to a small constant (at most ~6 calls)
      // regardless of plan size - same rows saved, same columns
      // touched, just far fewer trips.
      const { data: existingStrategyRows } = await supabase.from('strategies').select('id').eq('mission_id', currentMissionId);
      const keepStrategyIds = new Set(strategies.filter((s) => !s.isNew).map((s) => s.id));
      const strategyIdsToDelete = (existingStrategyRows || []).map((r) => r.id).filter((id) => !keepStrategyIds.has(id));
      if (strategyIdsToDelete.length) {
        const { error } = await supabase.from('strategies').delete().in('id', strategyIdsToDelete);
        if (error) throw error;
      }

      const existingStrategyPayloads = [];
      const newStrategyPayloads = [];
      strategies.forEach((strategy, sIndex) => {
        if (strategy.isNew) {
          newStrategyPayloads.push({ mission_id: currentMissionId, name: strategy.name, description: strategy.description, sort_order: sIndex });
        } else {
          existingStrategyPayloads.push({ id: strategy.id, mission_id: currentMissionId, name: strategy.name, description: strategy.description, sort_order: sIndex });
        }
      });

      if (existingStrategyPayloads.length) {
        const { error } = await supabase.from('strategies').upsert(existingStrategyPayloads, { onConflict: 'id' });
        if (error) throw error;
      }

      // sort_order is unique per strategy (the array index), so it is
      // used to match each created row back to its local temp id -
      // safer than assuming the insert response preserves input order.
      let createdStrategyRows = [];
      if (newStrategyPayloads.length) {
        const { data, error } = await supabase.from('strategies').insert(newStrategyPayloads).select();
        if (error) throw error;
        createdStrategyRows = data || [];
      }
      const sortOrderToNewStrategyId = {};
      createdStrategyRows.forEach((row) => { sortOrderToNewStrategyId[row.sort_order] = row.id; });

      const resolvedStrategyId = {};
      strategies.forEach((strategy, sIndex) => {
        resolvedStrategyId[strategy.id] = strategy.isNew ? sortOrderToNewStrategyId[sIndex] : strategy.id;
      });
      const allStrategyIds = Object.values(resolvedStrategyId);

      const { data: existingTacticRows } = allStrategyIds.length
        ? await supabase.from('tactics').select('id').in('strategy_id', allStrategyIds)
        : { data: [] };
      const keepTacticIds = new Set();
      strategies.forEach((strategy) => {
        strategy.tactics.forEach((tactic) => { if (!tactic.isNew) keepTacticIds.add(tactic.id); });
      });
      const tacticIdsToDelete = (existingTacticRows || []).map((r) => r.id).filter((id) => !keepTacticIds.has(id));
      if (tacticIdsToDelete.length) {
        const { error } = await supabase.from('tactics').delete().in('id', tacticIdsToDelete);
        if (error) throw error;
      }

      const existingTacticPayloads = [];
      const newTacticPayloads = [];
      const savedStrategies = strategies.map((strategy) => {
        const strategyId = resolvedStrategyId[strategy.id];
        const savedTactics = strategy.tactics.map((tactic, tIndex) => {
          const payload = {
            action: tactic.action,
            type: tactic.type,
            target_value: tactic.type === 'measurable' ? (tactic.target_value || null) : null,
            unit: tactic.type === 'measurable' ? (tactic.unit || null) : null,
            sort_order: tIndex,
          };
          if (tactic.isNew) {
            newTacticPayloads.push({ strategy_id: strategyId, ...payload, current_value: null, is_done: tactic.type === 'tickable' ? false : null });
          } else {
            existingTacticPayloads.push({ id: tactic.id, strategy_id: strategyId, ...payload });
          }
          return { ...tactic, ...payload };
        });
        return { ...strategy, id: strategyId, tactics: savedTactics };
      });

      if (existingTacticPayloads.length) {
        const { error } = await supabase.from('tactics').upsert(existingTacticPayloads, { onConflict: 'id' });
        if (error) throw error;
      }
      if (newTacticPayloads.length) {
        const { error } = await supabase.from('tactics').insert(newTacticPayloads);
        if (error) throw error;
      }

      try { sessionStorage.removeItem(draftKey); } catch { /* ignore */ }

      let toast = 'Plan saved. Nothing changed.';
      try {
        const result = await recordVersionAfterSave({ userId: user.id, missionId: currentMissionId, title: missionTitle, strategies: savedStrategies });
        toast = result.created ? `Saved as ${formatVersion(result.major, result.minor)}.` : 'Plan saved. Nothing changed.';
      } catch (error) {
        console.error('[PlanEdit] version save failed:', error);
        toast = 'Plan saved, but your version history could not be updated.';
      }

      navigate('/personal-operating-plan', { state: { toast } });
    } catch (error) {
      console.error('[PlanEdit] save failed:', error);
      setSaveError('Could not save. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscard = () => {
    setDiscardOpen(false);
    try { sessionStorage.removeItem(draftKey); } catch { /* ignore */ }
    navigate(missionId ? '/personal-operating-plan' : '/plan-section');
  };

  if (isLoading) {
    return (
      <div className="ui-root">
        <DesignHeader />
        <div className="plan-page"><Loading label="Loading your plan" className="ds-loading--page" /></div>
      </div>
    );
  }

  const actionButtons = (
    <>
      <Button type="button" variant="primary" disabled={isSaving} onClick={savePlan}>
        {isSaving ? 'Saving' : 'Save plan'}
      </Button>
      <span className="pop-save-preview">{previewLine}</span>
    </>
  );

  return (
    <div className="ui-root">
      <style>{`
        .ui-root .pop-grow { flex: 1; min-width: 0; }
        .ui-root .pop-unit-field { width: 160px; max-width: 100%; }
      `}</style>
      <DesignHeader />

      <div className="plan-page plan-page--form">
        <PageHeader title="Shape your personal operating plan" info={pageText.personalOperatingPlanEdit} />

        {pendingDraft && !draftDismissed && (
          <div className="pop-draft-banner">
            <span>We kept your unsaved changes from earlier.</span>
            <span style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <Button type="button" variant="text" onClick={applyDraft}>Use them</Button>
              <Button type="button" variant="text" onClick={discardDraft}>Discard them</Button>
            </span>
          </div>
        )}

        <div className="plan-field">
          <TextBox id="pop-title" label="Your mission statement" who="me" lines="many" placeholder="Define your mission in clear, compelling language..." value={missionTitle} onChange={setMissionTitle} maxLength={LIMITS.mission} />
          {fieldError?.field === 'mission' && <p className="plan-save-error" role="alert">{fieldError.message}</p>}
        </div>

        <div className="plan-label-row">
          <span className="ui-section-heading">Strategies</span>
          <Button type="button" variant="text" onClick={() => setInfoOpen('strategy')}>What is a strategy?</Button>
        </div>

        {strategies.map((strategy, sIndex) => (
          <div className="pop-strategy" key={strategy.id}>
            <div className="pop-strategy-top">
              <div className="pop-strategy-fields">
                <TextBox lines="one" placeholder="Strategy name" ariaLabel={`Strategy ${sIndex + 1} name`} value={strategy.name} onChange={(v) => updateStrategy(sIndex, 'name', v)} maxLength={LIMITS.strategyName} />
                <TextBox lines="many" placeholder="Why does this matter? How does it support your mission?" ariaLabel={`Strategy ${sIndex + 1} description`} value={strategy.description || ''} onChange={(v) => updateStrategy(sIndex, 'description', v)} maxLength={LIMITS.strategyDescription} />
                {fieldError?.field === `strategy-${sIndex}` && <p className="plan-save-error" role="alert">{fieldError.message}</p>}
              </div>
              <button type="button" className="plan-bin-btn" aria-label={`Remove strategy ${sIndex + 1}`} onClick={() => setDeleteTarget({ kind: 'strategy', sIndex })}>
                <BinIcon />
              </button>
            </div>

            <div className="pop-tactics">
              <div className="plan-label-row" style={{ marginTop: 0 }}>
                <span className="pop-tactic-label" style={{ marginBottom: 0 }}>Tactics</span>
                <Button type="button" variant="text" onClick={() => setInfoOpen('tactic')}>What is a tactic?</Button>
              </div>
              {strategy.tactics.map((tactic, tIndex) => {
                const targetWidth = `${Math.max(3, String(tactic.target_value ?? '').replace(/[^0-9]/g, '').length + 2)}ch`;
                return (
                  <div key={tactic.id} className="pop-tactic-editor">
                    <div className="pop-tactic-action-row">
                      <TextBox className="pop-grow" lines="one" placeholder="What's the specific action?" ariaLabel={`Tactic ${tIndex + 1}`} value={tactic.action} onChange={(v) => updateTactic(sIndex, tIndex, 'action', v)} maxLength={LIMITS.tacticAction} />
                      <button type="button" className="plan-bin-btn" aria-label={`Remove tactic ${tIndex + 1}`} onClick={() => setDeleteTarget({ kind: 'tactic', sIndex, tIndex })}>
                        <BinIcon />
                      </button>
                    </div>

                    <div className="pop-tactic-controls">
                      <SegmentedControl
                        label={`Tactic ${tIndex + 1} tracking type`}
                        options={[{ value: 'tickable', label: 'Tick off' }, { value: 'measurable', label: 'Measure' }]}
                        value={tactic.type}
                        onChange={(type) => updateTactic(sIndex, tIndex, 'type', type)}
                      />

                      {tactic.type === 'measurable' && (
                        <>
                          <div className="pop-tactic-field">
                            <label className="pop-tactic-label">Target</label>
                            <div className="tsa-stepper pop-target-stepper">
                              <button type="button" className="tsa-stepper-btn" aria-label="Decrease target" onClick={() => {
                                const current = Number(tactic.target_value) || 0;
                                const next = Math.max(0, current - stepBy(current));
                                updateTactic(sIndex, tIndex, 'target_value', next);
                              }}>&minus;</button>
                              <input type="number" inputMode="numeric" min="0" max="999999999999" style={{ width: targetWidth }} value={tactic.target_value ?? ''} onChange={(e) => updateTactic(sIndex, tIndex, 'target_value', e.target.value ? parseFloat(e.target.value) : null)} />
                              <button type="button" className="tsa-stepper-btn" aria-label="Increase target" onClick={() => {
                                const current = Number(tactic.target_value) || 0;
                                const next = Math.min(999999999999, current + stepBy(current));
                                updateTactic(sIndex, tIndex, 'target_value', next);
                              }}><Crosshair size="sm" /></button>
                            </div>
                          </div>
                          <TextField className="pop-unit-field" label="Unit" placeholder="£, hours..." maxLength={LIMITS.unit} value={tactic.unit || ''} onChange={(e) => updateTactic(sIndex, tIndex, 'unit', e.target.value)} />
                        </>
                      )}
                    </div>
                    {fieldError?.field === `tactic-${sIndex}-${tIndex}` && <p className="plan-save-error" role="alert">{fieldError.message}</p>}
                  </div>
                );
              })}
              <Button type="button" variant="outline" icon="plus" onClick={() => addTactic(sIndex)}>
                Add tactic
              </Button>
            </div>
          </div>
        ))}

        <Button type="button" variant="outline" icon="plus" onClick={addStrategy}>
          Add strategy
        </Button>

        {saveError && <p className="plan-save-error" role="alert">{saveError}</p>}

        <div className="plan-actions plan-actions--desktop">{actionButtons}</div>

        <div className="plan-discard-row">
          <DiscardLink onClick={() => setDiscardOpen(true)} />
        </div>
      </div>

      <PhoneActionBar>{actionButtons}</PhoneActionBar>

      <DiscardDialog
        isOpen={discardOpen}
        title="Discard your changes?"
        message="Anything you have not saved will be lost."
        onKeep={() => setDiscardOpen(false)}
        onDiscard={handleDiscard}
      />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={deleteTarget?.kind === 'strategy' ? 'Delete this strategy?' : 'Delete this tactic?'}
        message={deleteTarget?.kind === 'strategy' ? 'Its tactics will be deleted with it.' : 'This takes effect when you save.'}
        confirmLabel="Delete"
        confirmClassName="dng"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={deleteTarget?.kind === 'strategy' ? confirmDeleteStrategy : confirmDeleteTactic}
      />
      <ConfirmDialog
        open={infoOpen === 'strategy'}
        title="What is a strategy?"
        message={STRATEGY_INFO}
        confirmLabel="Got it"
        hideCancel
        onCancel={() => setInfoOpen(null)}
        onConfirm={() => setInfoOpen(null)}
      />
      <ConfirmDialog
        open={infoOpen === 'tactic'}
        title="What is a tactic?"
        message={TACTIC_INFO}
        confirmLabel="Got it"
        hideCancel
        onCancel={() => setInfoOpen(null)}
        onConfirm={() => setInfoOpen(null)}
      />
      <SavingOverlay isOpen={isSaving} message="Saving your plan" />
    </div>
  );
}
