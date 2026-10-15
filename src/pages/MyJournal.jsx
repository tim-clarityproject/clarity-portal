import { useContext, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { getLocalDateKey, formatDateAndTime } from '../lib/dateFormatter';
import {
  AFTER_ACTION_QUESTIONS, WEEKLY_QUESTIONS, RATINGS,
  weeklyTitle, afterActionTitle, validateReview,
  loadReviewByEntryId, loadWeeklyDraftFor, saveReview,
} from '../lib/reviewTool';
import { discardReviewDraft } from '../lib/discardDraft';
import DesignHeader from '../components/DesignHeader';
import PhoneActionBar from '../components/ui/PhoneActionBar';
import AutoGrowTextarea from '../components/ui/AutoGrowTextarea';
import { DiscardLink } from '../components/ui/DiscardLink';
import DiscardDialog from '../components/ui/DiscardDialog';
import NameDialog from '../components/ui/NameDialog';
import Toast from '../components/ui/Toast';
import useToast from '../hooks/useToast';
import PageHeading from '../components/PageHeading';

export default function MyJournal() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const reviewType = location.state?.reviewType === 'weekly-momentum' ? 'weekly-momentum' : 'after-action';
  const stateEntryId = location.state?.entryId || null;

  const [entryId, setEntryId] = useState(stateEntryId);
  const [existingStatus, setExistingStatus] = useState(null); // 'draft' | 'final' | null (new)
  // The saved title, so re-naming an existing review starts from its
  // own name instead of an empty box (patch D1). Weekly momentum names
  // itself from the week's date and never opens the pop-up, so this is
  // only ever read on the after-action path.
  const [currentTitle, setCurrentTitle] = useState('');
  const [dateKey, setDateKey] = useState(getLocalDateKey(new Date()));
  const [answers, setAnswers] = useState({ q1: '', q2: '', q3: '', q4: '' });
  const [ratings, setRatings] = useState({ momentum: null, intentionality: null, communication: null, performanceUnderPressure: null });
  const [continuingDraftDate, setContinuingDraftDate] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [discardOpen, setDiscardOpen] = useState(false);
  const [nameDialogOpen, setNameDialogOpen] = useState(false);
  const { message, showToast } = useToast();

  const questions = reviewType === 'weekly-momentum' ? WEEKLY_QUESTIONS : AFTER_ACTION_QUESTIONS;
  const pageTitle = reviewType === 'weekly-momentum' ? 'Weekly Momentum Check-in' : 'After-Action Review';
  const dateLabel = reviewType === 'weekly-momentum' ? 'Week ending' : 'When was it?';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) return;
      try {
        if (stateEntryId) {
          const row = await loadReviewByEntryId(user.id, stateEntryId);
          if (cancelled) return;
          const parsed = JSON.parse(row.content || '{}');
          setAnswers({ q1: parsed.q1 || '', q2: parsed.q2 || '', q3: parsed.q3 || '', q4: parsed.q4 || '' });
          setRatings({
            momentum: parsed.momentum || null,
            intentionality: parsed.intentionality || null,
            communication: parsed.communication || null,
            performanceUnderPressure: parsed.performanceUnderPressure || null,
          });
          setDateKey(row.entry_date);
          setExistingStatus(row.status || 'final');
          if (row.title) setCurrentTitle(row.title);
        } else if (reviewType === 'weekly-momentum') {
          const draft = await loadWeeklyDraftFor(user.id, dateKey);
          if (cancelled) return;
          if (draft) {
            const parsed = JSON.parse(draft.content || '{}');
            setAnswers({ q1: parsed.q1 || '', q2: parsed.q2 || '', q3: parsed.q3 || '', q4: '' });
            setRatings({
              momentum: parsed.momentum || null,
              intentionality: parsed.intentionality || null,
              communication: parsed.communication || null,
              performanceUnderPressure: parsed.performanceUnderPressure || null,
            });
            setEntryId(draft.id);
            setExistingStatus('draft');
            setContinuingDraftDate(formatDateAndTime(draft.updated_at || draft.created_at));
          }
        }
      } catch (error) {
        console.error('[MyJournal] load failed:', error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, stateEntryId, reviewType]);

  const updateAnswer = (key, value) => setAnswers((prev) => ({ ...prev, [key]: value }));
  const updateRating = (key, value) => setRatings((prev) => ({ ...prev, [key]: value }));

  const persist = async ({ title, status }) => {
    const savedId = await saveReview({
      userId: user.id,
      entryId,
      reviewType,
      dateKey,
      title,
      content: reviewType === 'weekly-momentum' ? { ...answers, ...ratings } : { ...answers },
      status,
    });
    setEntryId(savedId);
    return savedId;
  };

  const handleFinishConfirmed = async (title) => {
    setNameDialogOpen(false);
    setSaveError('');
    setIsSaving(true);
    try {
      const savedId = await persist({ title, status: 'final' });
      navigate('/review-summary', { state: { entryId: savedId, reviewType, toast: 'Review saved.' } });
    } catch (error) {
      console.error('[MyJournal] save failed:', error);
      setSaveError('Could not save - please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleFinish = () => {
    const problem = validateReview({ reviewType, answers, ratings });
    if (problem) {
      setSaveError(problem);
      return;
    }
    setSaveError('');
    if (reviewType === 'weekly-momentum') {
      handleFinishConfirmed(weeklyTitle(dateKey));
    } else {
      setNameDialogOpen(true);
    }
  };

  const handleSaveDraft = async () => {
    const hasContent = Object.values(answers).some((v) => v.trim()) || Object.values(ratings).some((v) => v);
    if (!hasContent) {
      showToast('Write something first.');
      return;
    }
    setSaveError('');
    setIsSaving(true);
    try {
      // Keeps whatever this review is already called - it used to write
      // afterActionTitle('') ("After-action review") every time, so
      // saving a draft silently renamed a review the person had named
      // themselves (patch D1, same root cause as the empty name pop-up).
      const title = reviewType === 'weekly-momentum' ? weeklyTitle(dateKey) : (currentTitle || afterActionTitle(''));
      await persist({ title, status: 'draft' });
      setExistingStatus('draft');
      showToast('Draft saved.');
      navigate('/my-reviews');
    } catch (error) {
      console.error('[MyJournal] draft save failed:', error);
      setSaveError('Could not save - please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // Deletes the saved row only when it is a DRAFT - editing a finished
  // review and pressing Discard loses the unsaved edits, never the
  // review itself (patch D1).
  const handleDiscard = async () => {
    setDiscardOpen(false);
    if (entryId && existingStatus === 'draft') {
      try {
        await discardReviewDraft(user.id, entryId);
      } catch (error) {
        console.error('[MyJournal] draft delete on discard failed:', error);
      }
    }
    navigate('/review-section', { state: { toast: 'Discarded.' } });
  };

  if (isLoading) {
    return (
      <div className="ui-root">
        <DesignHeader />
        <div className="plan-page"><p className="ui-subtitle">Loading...</p></div>
      </div>
    );
  }

  const canDraft = existingStatus !== 'final';

  const actionButtons = (
    <>
      <button type="button" className="ui-btn-primary" disabled={isSaving} onClick={handleFinish}>Finish</button>
      {canDraft && (
        <button type="button" className="ui-btn-ghost" disabled={isSaving} onClick={handleSaveDraft}>Save as draft</button>
      )}
    </>
  );

  return (
    <div className="ui-root">
      <DesignHeader />

      <div className="plan-page plan-page--form">
        <div className="plan-header">
          <PageHeading pageKey="myJournal" title={pageTitle} overline="Review" subtitle="" rule={false} />
        </div>

        {continuingDraftDate && (
          <div className="pop-draft-banner">
            <span>Continuing your draft from {continuingDraftDate}.</span>
          </div>
        )}

        <div className="plan-field">
          <label htmlFor="review-date">{dateLabel}</label>
          <input
            id="review-date"
            type="date"
            className="plan-input"
            value={dateKey}
            max={getLocalDateKey(new Date())}
            onChange={(e) => setDateKey(e.target.value)}
          />
        </div>

        {reviewType === 'weekly-momentum' && RATINGS.map((r) => (
          <div className="rate-row" key={r.key}>
            <div className="rate-head">
              <div>
                <span className="rate-label">{r.label}</span>
                <span className="rate-help">{r.help}</span>
              </div>
              {ratings[r.key] && <span className="rate-score">{ratings[r.key]} of 5</span>}
            </div>
            <div className="rate-scale" role="group" aria-label={r.label}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  className="rate-seg"
                  aria-pressed={ratings[r.key] === n}
                  onClick={() => updateRating(r.key, n)}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="rate-scale-labels"><span>Low</span><span>High</span></div>
          </div>
        ))}

        {questions.map((q, index) => (
          <div className={`plan-dq${answers[q.key].trim() ? ' on' : ''}`} key={q.key}>
            <div className="plan-dq-num">
              {String(index + 1).padStart(2, '0')}
              <svg className="plan-dq-check" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
            </div>
            <div>
              <label className="plan-dq-label" htmlFor={`rt-${q.key}`}>{q.label}</label>
              <AutoGrowTextarea id={`rt-${q.key}`} className="plan-dq-textarea" placeholder="Type here" value={answers[q.key]} onChange={(v) => updateAnswer(q.key, v)} />
            </div>
          </div>
        ))}

        {saveError && <p className="plan-save-error" role="alert">{saveError}</p>}

        <div className="plan-actions plan-actions--desktop">{actionButtons}</div>

        <div className="plan-discard-row">
          <DiscardLink onClick={() => setDiscardOpen(true)} />
        </div>
      </div>

      <PhoneActionBar>{actionButtons}</PhoneActionBar>

      <NameDialog
        open={nameDialogOpen}
        title="Name this review"
        message="Say what you're reviewing, or leave it blank."
        suggestedName={currentTitle}
        onConfirm={(name) => handleFinishConfirmed(afterActionTitle(name))}
        onCancel={() => setNameDialogOpen(false)}
      />

      <DiscardDialog
        isOpen={discardOpen}
        title="Discard this review?"
        message="Anything you have not saved will be lost."
        onKeep={() => setDiscardOpen(false)}
        onDiscard={handleDiscard}
      />
      <Toast message={message} />
    </div>
  );
}
