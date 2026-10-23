import pageText from '../content/pageText';
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { getLocalDateKey, formatPlainDayLabel } from '../lib/dateFormatter';
import {
  PROMPTS, MAX_CHARS, textBlock, addPrompt, removeBlock, textOf, wordCount,
  loadJournalByDate, saveJournal,
} from '../lib/dailyJournal';
import { discardJournalDraft } from '../lib/discardDraft';
import DesignHeader from '../components/DesignHeader';
import PhoneActionBar from '../components/ui/PhoneActionBar';
import { DiscardLink, BackLink } from '../components/ui/DiscardLink';
import DiscardDialog from '../components/ui/DiscardDialog';
import {
  Button, ChipRow, Chip, Crosshair, Loading, PageHeader, SaveStatus, TextBox, useToast,
} from '../components/design';

// The writing boxes and prompt questions sit in one column with the
// shared gap (each box has its own edge, so the old ruled lines above
// and below are not needed). The last box stays a tall page to write
// on, as before. On a phone the prompt chips are full-width rows, so
// they never wrap.
const JOURNAL_CSS = `
@media (max-width: 768px) {
  .ui-root .jrn-prompts {
    flex-direction: column;
    align-items: stretch;
  }
  .ui-root .jrn-prompts .ds-chip {
    display: flex;
    width: 100%;
  }
}
.ui-root .jrn-paper-wrap {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  border-top: 0;
  border-bottom: 0;
}
.ui-root .jrn-box--last .ds-grow > .ds-text,
.ui-root .jrn-box--last .ds-grow::after {
  min-height: 480px;
}
`;

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
  // 'draft' | 'final' | null (nothing saved for this day yet). Needed
  // so Discard can tell a saved draft (delete it) from a finished
  // journal (never delete it) - patch D1.
  const [existingStatus, setExistingStatus] = useState(null);
  const [blocks, setBlocks] = useState([textBlock('')]);
  const [saveStatus, setSaveStatus] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [pendingDraft, setPendingDraft] = useState(null);
  const toast = useToast();
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
          setExistingStatus(row.status === 'draft' ? 'draft' : 'final');
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
      toast.error('Write something first.');
      return null;
    }
    if (text.length > MAX_CHARS) {
      toast.error(`Keep your writing under ${MAX_CHARS.toLocaleString()} characters.`);
      return null;
    }
    const saved = await saveJournal({ userId: user.id, journalDate: dateKey, blocks, status: draft ? 'draft' : 'final', existingId });
    setExistingId(saved.id);
    setExistingStatus(draft ? 'draft' : 'final');
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
      toast.error('Could not save. Please try again.');
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
        toast.show('Draft saved.');
        navigate('/daily-journals');
      }
    } catch (error) {
      console.error('[DailyJournal] draft save failed:', error);
      toast.error('Could not save. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // Discard throws away this day's work. It deletes the saved row only
  // when that row is a DRAFT - a finished journal is never deleted by
  // walking away from it, only its unsaved edits are lost (patch D1).
  const handleDiscard = async () => {
    setDiscardOpen(false);
    if (existingId && existingStatus === 'draft') {
      try {
        await discardJournalDraft(user.id, existingId);
      } catch (error) {
        console.error('[DailyJournal] draft delete on discard failed:', error);
      }
    }
    try { sessionStorage.removeItem(draftKey); } catch { /* ignore */ }
    setBlocks([textBlock('')]);
    setExistingId(null);
    setExistingStatus(null);
    setSaveStatus('');
    navigate('/daily-journals', { state: { toast: 'Discarded.' } });
  };

  if (isLoading) {
    return (
      <div className="ui-root">
        <DesignHeader />
        <Loading label="Loading your journal" className="ds-loading--page" />
      </div>
    );
  }

  const actionButtons = (
    <>
      <Button variant="primary" disabled={isSaving} onClick={handleSaveJournal}>Save journal</Button>
      <Button variant="outline" disabled={isSaving} onClick={handleSaveDraft}>Save as draft</Button>
    </>
  );

  let lastTIndex = -1;
  blocks.forEach((b, i) => { if (b.t === 't') lastTIndex = i; });

  return (
    <div className="ui-root">
      <style>{JOURNAL_CSS}</style>
      <DesignHeader />

      <div className="plan-page plan-page--form">
        <PageHeader
          title={`${formatPlainDayLabel(dateObj)} ${dateObj.getFullYear()}`}
          info={pageText.dailyJournal}
        />

        {pendingDraft && (
          <div className="jrn-draft-banner">
            <span>We kept your unsaved writing from earlier.</span>
            <span style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <Button variant="text" onClick={applyDraft}>Use it</Button>
              <Button variant="text" onClick={discardDraft}>Discard it</Button>
            </span>
          </div>
        )}

        <ChipRow className="jrn-prompts" label="Need a way in?">
          {PROMPTS.map((p) => (
            // An action, not an on/off choice, so no aria-pressed.
            <Chip key={p} aria-pressed={undefined} onClick={() => handlePrompt(p)}>{p}</Chip>
          ))}
        </ChipRow>

        <div className="jrn-paper-wrap">
          {blocks.map((b, i) => (
            b.t === 'p' ? (
              <div className="jrn-qrow" key={i}>
                <span className="jrn-qdash" aria-hidden="true" />
                <span className="jrn-qtext">{b.v}</span>
                <button type="button" className="jrn-qremove" aria-label="Remove this question" onClick={() => handleRemoveBlock(i)}><Crosshair variant="close" size="sm" /></button>
              </div>
            ) : (
              <TextBox
                key={i}
                ref={i === lastTIndex ? lastInputRef : undefined}
                className={i === lastTIndex ? 'jrn-box jrn-box--last' : 'jrn-box'}
                lines="many"
                focusMode
                who={i === 0 ? 'me' : undefined}
                placeholder={i === lastTIndex ? 'Start writing...' : undefined}
                ariaLabel={i === 0 ? 'Daily Journal' : 'Daily Journal, continued'}
                value={b.v}
                onChange={(v) => changeBlock(i, v)}
              />
            )
          ))}
        </div>

        <div className="jrn-meta">
          <span>{words} word{words === 1 ? '' : 's'}</span>
          <SaveStatus state={isSaving ? 'saving' : (saveStatus ? 'saved' : 'idle')} />
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
    </div>
  );
}
