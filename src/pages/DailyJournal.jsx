import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { getLocalDateKey, formatPlainDayLabel } from '../lib/dateFormatter';
import {
  PROMPTS, MAX_CHARS, textBlock, addPrompt, removeBlock, textOf, wordCount,
  loadJournalByDate, saveJournal,
} from '../lib/dailyJournal';
import DesignHeader from '../components/DesignHeader';
import PhoneActionBar from '../components/ui/PhoneActionBar';
import AutoGrowTextarea from '../components/ui/AutoGrowTextarea';
import { DiscardLink, BackLink } from '../components/ui/DiscardLink';
import DiscardDialog from '../components/ui/DiscardDialog';
import Toast from '../components/ui/Toast';
import useToast from '../hooks/useToast';

export default function DailyJournal() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  // Frozen at mount, not recomputed every render - writing past
  // midnight keeps the day the page was opened on (spec edge case).
  const [dateKey] = useState(() => location.state?.date || getLocalDateKey(new Date()));
  const dateObj = useMemo(() => new Date(`${dateKey}T00:00:00`), [dateKey]);
  const draftKey = `clarity-journal-draft-${dateKey}`;

  const [existingId, setExistingId] = useState(null);
  const [blocks, setBlocks] = useState([textBlock('')]);
  const [saveStatus, setSaveStatus] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [pendingDraft, setPendingDraft] = useState(null);
  const { message, showToast } = useToast();
  const lastInputRef = useRef(null);
  const focusLastRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const row = await loadJournalByDate(user.id, dateKey);
        if (cancelled) return;
        if (row) {
          setExistingId(row.id);
          setBlocks(row.body?.length ? row.body : [textBlock('')]);
          setSaveStatus(row.status === 'draft' ? 'Draft saved' : 'Saved');
        }
      } catch (error) {
        console.error('[DailyJournal] load failed:', error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, dateKey]);

  // Visible draft restore (same pattern as the plan edit page): never
  // silently swap in sessionStorage content.
  useEffect(() => {
    if (isLoading) return;
    try {
      const raw = sessionStorage.getItem(draftKey);
      if (raw) setPendingDraft(JSON.parse(raw));
    } catch (error) {
      console.error('[DailyJournal] draft read failed:', error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  useEffect(() => {
    if (isLoading || pendingDraft) return;
    const timeout = setTimeout(() => {
      try {
        sessionStorage.setItem(draftKey, JSON.stringify({ blocks, timestamp: Date.now() }));
      } catch (error) {
        console.error('[DailyJournal] draft save failed:', error);
      }
    }, 1000);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, isLoading, pendingDraft]);

  useEffect(() => {
    if (focusLastRef.current) {
      focusLastRef.current = false;
      lastInputRef.current?.focus();
    }
  }, [blocks]);

  const applyDraft = () => {
    if (!pendingDraft) return;
    setBlocks(pendingDraft.blocks || [textBlock('')]);
    setSaveStatus('');
    setPendingDraft(null);
  };

  const discardDraft = () => {
    try { sessionStorage.removeItem(draftKey); } catch { /* ignore */ }
    setPendingDraft(null);
  };

  const words = wordCount(blocks);

  const changeBlock = (index, value) => {
    const updated = [...blocks];
    updated[index] = { ...updated[index], v: value };
    setBlocks(updated);
    setSaveStatus('');
  };

  const handlePrompt = (question) => {
    setBlocks(addPrompt(blocks, question));
    setSaveStatus('');
    focusLastRef.current = true;
  };

  const handleRemoveBlock = (index) => {
    setBlocks(removeBlock(blocks, index));
    setSaveStatus('');
  };

  const persist = async (draft) => {
    const text = textOf(blocks);
    if (!text) {
      showToast('Write something first.');
      return null;
    }
    if (text.length > MAX_CHARS) {
      showToast(`Keep your writing under ${MAX_CHARS.toLocaleString()} characters.`);
      return null;
    }
    const saved = await saveJournal({ userId: user.id, journalDate: dateKey, blocks, status: draft ? 'draft' : 'final', existingId });
    setExistingId(saved.id);
    try { sessionStorage.removeItem(draftKey); } catch { /* ignore */ }
    return saved;
  };

  const handleSaveJournal = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const saved = await persist(false);
      if (saved) navigate('/daily-journals', { state: { toast: 'Journal saved. It is in My Reviews too.' } });
    } catch (error) {
      console.error('[DailyJournal] save failed:', error);
      showToast('Could not save - please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveDraft = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const saved = await persist(true);
      if (saved) {
        setSaveStatus('Draft saved');
        showToast('Draft saved.');
      }
    } catch (error) {
      console.error('[DailyJournal] draft save failed:', error);
      showToast('Could not save - please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscard = () => {
    setDiscardOpen(false);
    try { sessionStorage.removeItem(draftKey); } catch { /* ignore */ }
    navigate('/daily-journals', { state: { toast: 'Discarded.' } });
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
      <button type="button" className="ui-btn-primary" disabled={isSaving} onClick={handleSaveJournal}>Save journal</button>
      <button type="button" className="ui-btn-ghost" disabled={isSaving} onClick={handleSaveDraft}>Save as draft</button>
    </>
  );

  let lastTIndex = -1;
  blocks.forEach((b, i) => { if (b.t === 't') lastTIndex = i; });

  return (
    <div className="ui-root">
      <DesignHeader />

      <div className="plan-page plan-page--form">
        <span className="plan-overline">Daily Journal</span>
        <h1 className="jrn-date">{formatPlainDayLabel(dateObj)}<small>{dateObj.getFullYear()}</small></h1>
        <p className="ui-subtitle jrn-sub">Write whatever is on your mind. Do not edit, do not aim for good. Keep going until your head is clear.</p>

        {pendingDraft && (
          <div className="jrn-draft-banner">
            <span>We kept your unsaved writing from earlier.</span>
            <span style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <button type="button" className="plan-link-btn" onClick={applyDraft}>Use it</button>
              <button type="button" className="plan-link-btn" onClick={discardDraft}>Discard it</button>
            </span>
          </div>
        )}

        <div className="jrn-prompts" aria-label="Need a way in?">
          {PROMPTS.map((p) => (
            <button type="button" className="jrn-prompt-btn" key={p} onClick={() => handlePrompt(p)}>{p}</button>
          ))}
        </div>

        <div className="jrn-paper-wrap">
          {blocks.map((b, i) => (
            b.t === 'p' ? (
              <div className="jrn-qrow" key={i}>
                <span className="jrn-qdash" aria-hidden="true" />
                <span className="jrn-qtext">{b.v}</span>
                <button type="button" className="jrn-qremove" aria-label="Remove this question" onClick={() => handleRemoveBlock(i)}>×</button>
              </div>
            ) : (
              <AutoGrowTextarea
                key={i}
                ref={i === lastTIndex ? lastInputRef : undefined}
                className="jrn-paper"
                placeholder={i === lastTIndex ? 'Start writing...' : undefined}
                aria-label={i === 0 ? 'Daily Journal' : 'Daily Journal, continued'}
                value={b.v}
                onChange={(v) => changeBlock(i, v)}
                minPixelHeight={i === lastTIndex ? 480 : 40}
              />
            )
          ))}
        </div>

        <div className="jrn-meta">
          <span>{words} word{words === 1 ? '' : 's'}</span>
          <span>{saveStatus ? <span className="ok">{saveStatus}</span> : 'Not saved yet'}</span>
        </div>

        <div className="plan-actions plan-actions--desktop" style={{ marginTop: 'var(--space-6)' }}>{actionButtons}</div>

        <div className="plan-discard-row" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <BackLink onClick={() => navigate('/daily-journals')} label="Back to My Journals" />
          <DiscardLink onClick={() => setDiscardOpen(true)} />
        </div>
      </div>

      <PhoneActionBar>{actionButtons}</PhoneActionBar>

      <DiscardDialog
        isOpen={discardOpen}
        title="Discard this journal?"
        message="Anything you have not saved will be lost."
        onKeep={() => setDiscardOpen(false)}
        onDiscard={handleDiscard}
      />
      <Toast message={message} />
    </div>
  );
}
