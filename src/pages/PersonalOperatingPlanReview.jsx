import { useContext, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { formatDateAndTime } from '../lib/dateFormatter';
import { LIMITS, loadLatestVersion, loadDraftReview, loadReview, saveReview, deleteReview } from '../lib/missionPlan';
import DesignHeader from '../components/DesignHeader';
import pageText from '../content/pageText';
import PhoneActionBar from '../components/ui/PhoneActionBar';
import { BackLink, DiscardLink } from '../components/ui/DiscardLink';
import DiscardDialog from '../components/ui/DiscardDialog';
import { DisclosureArrow, Loading, PageHeader, TextBox, Button, Checkbox, useToast } from '../components/design';

function NoteIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.5 5.5h15v10h-7l-4.5 3.5v-3.5h-3.5z" />
    </svg>
  );
}

export default function PersonalOperatingPlanReview() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const stateMissionId = location.state?.missionId || null;
  const reviewId = location.state?.reviewId || null;

  const [mission, setMission] = useState(null);
  const [strategies, setStrategies] = useState([]);
  const [reviewData, setReviewData] = useState({});
  const [expandedStrategies, setExpandedStrategies] = useState({});
  const [openNotes, setOpenNotes] = useState({});
  const [existingReviewId, setExistingReviewId] = useState(reviewId);
  const [latestVersion, setLatestVersion] = useState(null);
  const [continuingDraftDate, setContinuingDraftDate] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [discardOpen, setDiscardOpen] = useState(false);
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) return;
      try {
        // Self-resolving: a missionId in router state is used when
        // present, but a direct visit (refresh, bookmark) falls back to
        // the user's current non-archived mission instead of hanging on
        // a blank screen forever (prompt 9 fix for the old dead end).
        let missionRow = null;
        if (stateMissionId) {
          const { data } = await supabase
            .from('missions')
            .select('*')
            .eq('id', stateMissionId)
            .eq('user_id', user.id)
            .is('archived_at', null)
            .single();
          missionRow = data || null;
        } else {
          const { data } = await supabase
            .from('missions')
            .select('*')
            .eq('user_id', user.id)
            .is('archived_at', null)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          missionRow = data || null;
        }

        if (cancelled) return;
        if (!missionRow) {
          setIsLoading(false);
          return;
        }
        setMission(missionRow);

        const { data: strategiesData } = await supabase
          .from('strategies')
          .select('*')
          .eq('mission_id', missionRow.id)
          .order('sort_order', { ascending: true });

        const withTactics = await Promise.all(
          (strategiesData || []).map(async (strategy) => {
            const { data: tactics } = await supabase
              .from('tactics')
              .select('*')
              .eq('strategy_id', strategy.id)
              .order('sort_order', { ascending: true });
            return { ...strategy, tactics: tactics || [] };
          })
        );
        if (cancelled) return;
        setStrategies(withTactics);

        const initial = {};
        withTactics.forEach((strategy) => {
          strategy.tactics.forEach((tactic) => {
            initial[tactic.id] = { isDone: tactic.is_done || false, value: tactic.current_value ?? '', note: '' };
          });
        });

        if (withTactics.length > 0) setExpandedStrategies({ [withTactics[0].id]: true });

        try {
          const latest = await loadLatestVersion(missionRow.id);
          if (!cancelled) setLatestVersion(latest);
        } catch (error) {
          console.error('[PlanReview] version lookup failed:', error);
        }

        if (reviewId) {
          try {
            const review = await loadReview(user.id, reviewId);
            if (!cancelled && review?.review_data?.tactics) {
              Object.assign(initial, review.review_data.tactics);
              setExistingReviewId(review.id);
            }
          } catch (error) {
            console.error('[PlanReview] load existing review failed:', error);
          }
        } else {
          try {
            const draft = await loadDraftReview(user.id, missionRow.id);
            if (!cancelled && draft) {
              if (draft.review_data?.tactics) Object.assign(initial, draft.review_data.tactics);
              setExistingReviewId(draft.id);
              setContinuingDraftDate(formatDateAndTime(draft.updated_at || draft.created_at));
            }
          } catch (error) {
            console.error('[PlanReview] draft lookup failed:', error);
          }
        }

        if (!cancelled) {
          setReviewData(initial);
          const notesAlreadyOpen = {};
          Object.entries(initial).forEach(([tacticId, r]) => {
            if (r.note && r.note.trim()) notesAlreadyOpen[tacticId] = true;
          });
          setOpenNotes(notesAlreadyOpen);
        }
      } catch (error) {
        console.error('[PlanReview] load failed:', error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, stateMissionId, reviewId]);

  const toggleStrategy = (strategyId) => {
    setExpandedStrategies((prev) => ({ ...prev, [strategyId]: !prev[strategyId] }));
  };

  const updateReview = (tacticId, field, value) => {
    setReviewData((prev) => ({ ...prev, [tacticId]: { ...prev[tacticId], [field]: value } }));
  };

  const submit = async (draft) => {
    setSaveError('');
    setIsSubmitting(true);
    try {
      const reviewPayload = {
        mission_id: mission.id,
        mission_title: mission.title,
        tactics: reviewData,
        strategies: strategies.map((strategy) => ({
          id: strategy.id,
          name: strategy.name,
          description: strategy.description,
          tactics: strategy.tactics.map((tactic) => ({
            id: tactic.id,
            action: tactic.action,
            type: tactic.type,
            target_value: tactic.target_value,
            unit: tactic.unit,
            reviewed_is_done: tactic.type === 'tickable' ? Boolean(reviewData[tactic.id]?.isDone) : null,
            reviewed_value: tactic.type === 'measurable' ? (reviewData[tactic.id]?.value ?? null) : null,
            reviewed_note: reviewData[tactic.id]?.note || null,
          })),
        })),
      };

      const savedId = await saveReview({
        userId: user.id,
        missionId: mission.id,
        planVersionId: latestVersion?.id || null,
        reviewData: reviewPayload,
        status: draft ? 'draft' : 'final',
        existingId: existingReviewId,
      });

      if (!draft) {
        // Write reviewed progress back onto the live plan, so the main
        // plan view reflects it (prompt 9 fix: tick state was computed
        // but never actually written anywhere before).
        for (const strategy of strategies) {
          for (const tactic of strategy.tactics) {
            const r = reviewData[tactic.id];
            if (!r) continue;
            const update = { last_reviewed_at: new Date().toISOString() };
            if (tactic.type === 'tickable') update.is_done = Boolean(r.isDone);
            if (tactic.type === 'measurable' && r.value !== '') update.current_value = r.value;
            await supabase.from('tactics').update(update).eq('id', tactic.id);
          }
        }
        navigate('/mission-progress-review', { state: { reviewId: savedId, toast: 'Review saved.' } });
      } else {
        setExistingReviewId(savedId);
        toast.show('Draft saved.');
        navigate('/my-reviews');
      }
    } catch (error) {
      console.error('[PlanReview] save failed:', error);
      setSaveError('Could not save. Please try again. This may need a database change the site owner has not run yet.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDiscard = async () => {
    setDiscardOpen(false);
    // Discard only ever removes a DRAFT row (an existing final review
    // being edited must never be deleted by walking away from it).
    if (existingReviewId && continuingDraftDate) {
      try {
        await deleteReview(user.id, existingReviewId);
      } catch (error) {
        console.error('[PlanReview] draft delete on discard failed:', error);
      }
    }
    navigate('/personal-operating-plan');
  };

  if (isLoading) {
    return (
      <div className="ui-root">
        <DesignHeader />
        <div className="plan-page"><Loading label="Loading your review" className="ds-loading--page" /></div>
      </div>
    );
  }

  if (!mission) {
    return (
      <div className="ui-root">
        <DesignHeader />
        <div className="plan-page">
          <div className="plan-header">
            <PageHeader title="Review your plan" info={pageText.personalOperatingPlanReviewEmpty} />
          </div>
          <div className="plan-actions">
            <Button type="button" variant="primary" onClick={() => navigate('/personal-operating-plan-edit', { state: { isNew: true } })}>
              Create your plan
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const actionButtons = (
    <>
      <Button type="button" variant="primary" disabled={isSubmitting} onClick={() => submit(false)}>Finish review</Button>
      <Button type="button" variant="outline" disabled={isSubmitting} onClick={() => submit(true)}>Save as draft</Button>
    </>
  );

  return (
    <div className="ui-root">
      <style>{`
        .ui-root .pop-review-check { flex: 1; min-width: 0; }
        .ui-root .plan-field label {
          font-family: var(--font-body);
          text-transform: none;
          letter-spacing: normal;
          font-size: var(--fs-label-row);
          color: var(--text-2);
        }
      `}</style>
      <DesignHeader />

      <div className="plan-page plan-page--form">
        <div className="pop-review-heading">
          <PageHeader title="Review your plan" info={pageText.personalOperatingPlanReview} />
        </div>

        {continuingDraftDate && (
          <div className="pop-draft-banner">
            <span>Continuing your draft from {continuingDraftDate}.</span>
          </div>
        )}

        {strategies.map((strategy) => (
          <div className="pop-view-strategy" key={strategy.id}>
            <button type="button" className="plan-link-btn" aria-expanded={Boolean(expandedStrategies[strategy.id])} onClick={() => toggleStrategy(strategy.id)} style={{ display: 'flex', width: '100%', justifyContent: 'space-between' }}>
              <span>
                <span className="pop-view-strategy-name" style={{ display: 'block' }}>{strategy.name}</span>
                {strategy.description && <span className="pop-view-strategy-desc" style={{ display: 'block' }}>{strategy.description}</span>}
              </span>
              <DisclosureArrow open={Boolean(expandedStrategies[strategy.id])} />
            </button>

            {expandedStrategies[strategy.id] && strategy.tactics.map((tactic) => {
              const hasNote = Boolean(reviewData[tactic.id]?.note?.trim());
              const noteIsOpen = Boolean(openNotes[tactic.id]) || hasNote;
              return (
                <div key={tactic.id} style={{ marginTop: 'var(--space-4)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    {tactic.type === 'tickable' ? (
                      <div className="pop-review-check">
                        <Checkbox checked={Boolean(reviewData[tactic.id]?.isDone)} onChange={(done) => updateReview(tactic.id, 'isDone', done)}>
                          {tactic.action}
                        </Checkbox>
                      </div>
                    ) : (
                      <p className="pop-view-tactic-text" style={{ flex: 1, margin: 0 }}>{tactic.action}</p>
                    )}
                    <button
                      type="button"
                      className={`plan-bin-btn pop-note-btn${hasNote ? ' has' : ''}`}
                      aria-label={hasNote ? 'Edit note' : 'Add a note'}
                      title={hasNote ? 'Edit note' : 'Add a note'}
                      onClick={() => setOpenNotes((prev) => ({ ...prev, [tactic.id]: true }))}
                    >
                      <NoteIcon />
                    </button>
                  </div>

                  {tactic.type === 'measurable' && (
                    <div className="plan-field" style={{ marginTop: 'var(--space-2)' }}>
                      <label>Current value · target {tactic.target_value} {tactic.unit}</label>
                      <input type="number" className="plan-input" value={reviewData[tactic.id]?.value ?? ''} onChange={(e) => updateReview(tactic.id, 'value', e.target.value ? parseFloat(e.target.value) : '')} />
                    </div>
                  )}

                  {noteIsOpen && (
                    <div style={{ marginTop: 'var(--space-2)' }}>
                      <TextBox ariaLabel={`Reflection or comment on ${tactic.action}`} who="me" lines="many" focusMode placeholder="Add a reflection or comment..." value={reviewData[tactic.id]?.note || ''} onChange={(v) => updateReview(tactic.id, 'note', v)} maxLength={LIMITS.reviewNote} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}

        {saveError && <p className="plan-save-error" role="alert">{saveError}</p>}

        <div className="plan-actions plan-actions--desktop">{actionButtons}</div>

        <div className="plan-discard-row" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <BackLink onClick={() => navigate('/personal-operating-plan')} label="Back to my plan" />
          <DiscardLink onClick={() => setDiscardOpen(true)} />
        </div>
      </div>

      <PhoneActionBar>{actionButtons}</PhoneActionBar>

      <DiscardDialog
        isOpen={discardOpen}
        title="Discard this review?"
        message="Anything you have not saved will be lost."
        onKeep={() => setDiscardOpen(false)}
        onDiscard={handleDiscard}
      />
    </div>
  );
}
