import { useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { buildSnapshot, diffSnapshots, formatVersion, loadLatestVersion, recordVersionAfterSave } from '../lib/missionPlan';
import DesignHeader from '../components/DesignHeader';
import PhoneActionBar from '../components/ui/PhoneActionBar';
import AutoGrowTextarea from '../components/ui/AutoGrowTextarea';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { DiscardLink } from '../components/ui/DiscardLink';
import DiscardDialog from '../components/ui/DiscardDialog';

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
  const [discardOpen, setDiscardOpen] = useState(false);
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

  const nextSnapshot = useMemo(() => buildSnapshot(missionTitle, strategies), [missionTitle, strategies]);
  const bump = useMemo(() => diffSnapshots(baselineVersion?.snapshot || null, nextSnapshot), [baselineVersion, nextSnapshot]);
  const previewVersion = useMemo(() => {
    if (!baselineVersion) return formatVersion(1, 0);
    if (!bump) return formatVersion(baselineVersion.version_major, baselineVersion.version_minor);
    if (bump === 'major') return formatVersion(baselineVersion.version_major + 1, 0);
    return formatVersion(baselineVersion.version_major, baselineVersion.version_minor + 1);
  }, [baselineVersion, bump]);

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
    if (!missionTitle.trim()) {
      setSaveError('Your mission statement is required.');
      return;
    }
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
      } else {
        const { error } = await supabase.from('missions').update({ title: missionTitle }).eq('id', currentMissionId);
        if (error) throw error;
      }

      await supabase.from('profiles').update({ personal_goal: missionTitle }).eq('id', user.id);

      const { data: existingStrategies } = await supabase.from('strategies').select('id').eq('mission_id', currentMissionId);
      for (const existing of existingStrategies || []) {
        if (!strategies.some((s) => s.id === existing.id)) {
          const { error } = await supabase.from('strategies').delete().eq('id', existing.id);
          if (error) throw error;
        }
      }

      const savedStrategies = [];
      for (let sIndex = 0; sIndex < strategies.length; sIndex++) {
        const strategy = strategies[sIndex];
        let strategyId = strategy.id;

        if (strategy.isNew) {
          const { data: created, error } = await supabase
            .from('strategies')
            .insert([{ mission_id: currentMissionId, name: strategy.name, description: strategy.description, sort_order: sIndex }])
            .select()
            .single();
          if (error) throw error;
          strategyId = created.id;
        } else {
          const { error } = await supabase
            .from('strategies')
            .update({ name: strategy.name, description: strategy.description, sort_order: sIndex })
            .eq('id', strategyId);
          if (error) throw error;
        }

        const { data: existingTactics } = await supabase.from('tactics').select('id').eq('strategy_id', strategyId);
        for (const existing of existingTactics || []) {
          if (!strategy.tactics.some((t) => t.id === existing.id)) {
            const { error } = await supabase.from('tactics').delete().eq('id', existing.id);
            if (error) throw error;
          }
        }

        const savedTactics = [];
        for (let tIndex = 0; tIndex < strategy.tactics.length; tIndex++) {
          const tactic = strategy.tactics[tIndex];
          const payload = {
            action: tactic.action,
            type: tactic.type,
            target_value: tactic.type === 'measurable' ? (tactic.target_value || null) : null,
            unit: tactic.type === 'measurable' ? (tactic.unit || null) : null,
            sort_order: tIndex,
          };
          if (tactic.isNew) {
            const { data: created, error } = await supabase
              .from('tactics')
              .insert([{ strategy_id: strategyId, ...payload, current_value: null, is_done: tactic.type === 'tickable' ? false : null }])
              .select()
              .single();
            if (error) throw error;
            savedTactics.push(created);
          } else {
            const { error } = await supabase.from('tactics').update(payload).eq('id', tactic.id);
            if (error) throw error;
            savedTactics.push({ ...tactic, ...payload });
          }
        }
        savedStrategies.push({ ...strategy, id: strategyId, tactics: savedTactics });
      }

      try { sessionStorage.removeItem(draftKey); } catch { /* ignore */ }

      let toast = 'Plan saved.';
      try {
        const result = await recordVersionAfterSave({ userId: user.id, missionId: currentMissionId, title: missionTitle, strategies: savedStrategies });
        toast = result.created ? `Saved as ${formatVersion(result.major, result.minor)}.` : 'Plan saved.';
      } catch (error) {
        console.error('[PlanEdit] version save failed:', error);
        toast = 'Plan saved, but your version history could not be updated.';
      }

      navigate('/personal-operating-plan', { state: { toast } });
    } catch (error) {
      console.error('[PlanEdit] save failed:', error);
      setSaveError('Could not save - please try again.');
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
        <div className="plan-page"><p className="ui-subtitle">Loading...</p></div>
      </div>
    );
  }

  const actionButtons = (
    <>
      <button type="button" className="ui-btn-primary" disabled={isSaving} onClick={savePlan}>
        {isSaving ? 'Saving...' : 'Save plan'}
      </button>
    </>
  );

  return (
    <div className="ui-root">
      <DesignHeader />

      <div className="plan-page plan-page--form">
        <div className="plan-header">
          <div className="ui-title">{isNew ? 'Create your plan' : 'Edit your plan'}</div>
          <p className="ui-subtitle">Saving creates {previewVersion}.</p>
        </div>

        {pendingDraft && !draftDismissed && (
          <div className="pop-draft-banner">
            <span>We kept your unsaved changes from earlier.</span>
            <span style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <button type="button" className="plan-link-btn" onClick={applyDraft}>Use them</button>
              <button type="button" className="plan-link-btn" onClick={discardDraft}>Discard them</button>
            </span>
          </div>
        )}

        <div className="plan-field">
          <label htmlFor="pop-title">Your mission statement</label>
          <AutoGrowTextarea id="pop-title" className="plan-input" placeholder="Define your mission in clear, compelling language..." value={missionTitle} onChange={setMissionTitle} />
        </div>

        <div className="plan-label-row">
          <span className="ui-section-heading">Strategies</span>
        </div>

        {strategies.map((strategy, sIndex) => (
          <div className="pop-strategy" key={strategy.id}>
            <div className="pop-strategy-top">
              <div className="pop-strategy-fields">
                <AutoGrowTextarea singleLine className="plan-input" placeholder="Strategy name" aria-label={`Strategy ${sIndex + 1} name`} value={strategy.name} onChange={(v) => updateStrategy(sIndex, 'name', v)} />
                <AutoGrowTextarea className="plan-input" placeholder="Why does this matter? How does it support your mission?" aria-label={`Strategy ${sIndex + 1} description`} value={strategy.description || ''} onChange={(v) => updateStrategy(sIndex, 'description', v)} />
              </div>
              <button type="button" className="plan-bin-btn" aria-label={`Remove strategy ${sIndex + 1}`} onClick={() => setDeleteTarget({ kind: 'strategy', sIndex })}>
                <BinIcon />
              </button>
            </div>

            <div className="pop-tactics">
              {strategy.tactics.map((tactic, tIndex) => (
                <div className="pop-tactic-row" key={tactic.id}>
                  <AutoGrowTextarea singleLine className="plan-input" placeholder="What's the specific action?" aria-label={`Tactic ${tIndex + 1}`} value={tactic.action} onChange={(v) => updateTactic(sIndex, tIndex, 'action', v)} />
                  <div>
                    <select className="plan-input" value={tactic.type} onChange={(e) => updateTactic(sIndex, tIndex, 'type', e.target.value)} aria-label={`Tactic ${tIndex + 1} type`}>
                      <option value="tickable">Tickable</option>
                      <option value="measurable">Measurable</option>
                    </select>
                    {tactic.type === 'measurable' && (
                      <div className="pop-tactic-measure" style={{ marginTop: 'var(--space-2)' }}>
                        <div>
                          <label className="pop-tactic-label">Target</label>
                          <input type="number" className="plan-input" value={tactic.target_value || ''} onChange={(e) => updateTactic(sIndex, tIndex, 'target_value', e.target.value ? parseFloat(e.target.value) : null)} />
                        </div>
                        <div>
                          <label className="pop-tactic-label">Unit</label>
                          <input type="text" className="plan-input" value={tactic.unit || ''} onChange={(e) => updateTactic(sIndex, tIndex, 'unit', e.target.value)} />
                        </div>
                      </div>
                    )}
                  </div>
                  <button type="button" className="plan-bin-btn" aria-label={`Remove tactic ${tIndex + 1}`} onClick={() => setDeleteTarget({ kind: 'tactic', sIndex, tIndex })}>
                    <BinIcon />
                  </button>
                </div>
              ))}
              <button type="button" className="plan-add-btn" onClick={() => addTactic(sIndex)}>
                <span className="ui-cross ui-cross--sm" aria-hidden="true" />
                Add tactic
              </button>
            </div>
          </div>
        ))}

        <button type="button" className="plan-add-btn" onClick={addStrategy}>
          <span className="ui-cross ui-cross--sm" aria-hidden="true" />
          Add strategy
        </button>

        {saveError && <p className="plan-save-error" role="alert">{saveError}</p>}

        <div className="plan-actions plan-actions--desktop">{actionButtons}</div>

        <div className="plan-discard-row">
          <DiscardLink onClick={() => setDiscardOpen(true)} />
        </div>
      </div>

      <PhoneActionBar>{actionButtons}</PhoneActionBar>

      <DiscardDialog
        isOpen={discardOpen}
        title="Discard these changes?"
        message="Anything you have not saved will be lost."
        onKeep={() => setDiscardOpen(false)}
        onDiscard={handleDiscard}
      />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={deleteTarget?.kind === 'strategy' ? 'Delete this strategy?' : 'Delete this tactic?'}
        message={deleteTarget?.kind === 'strategy' ? 'This also removes all of its tactics. This takes effect when you save.' : 'This takes effect when you save.'}
        confirmLabel="Delete"
        confirmClassName="dng"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={deleteTarget?.kind === 'strategy' ? confirmDeleteStrategy : confirmDeleteTactic}
      />
    </div>
  );
}
