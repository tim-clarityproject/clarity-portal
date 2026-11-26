import { useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { getLocalDateKey, formatPlainDayLabel } from '../lib/dateFormatter';
import {
  PROMPTS, MAX_CHARS, textBlock, addPrompt, removeBlock, textOf, wordCount,
  loadJournalByDate, saveJournal,
} from '../lib/dailyJournal';
import { discardJournalDraft } from '../lib/discardDraft';
import { useDraft } from '../lib/drafts';
import { isNetworkError, isOnline } from '../lib/connection';
import { saveOrQueue, useQueuedSave } from '../lib/syncQueue';
import { readCache, writeCache } from '../lib/pageCache';
import FormTool from './toolFocus/FormTool';
import { JOURNAL_QUESTION } from '../content/pageLines/client';
import DiscardDialog from '../components/ui/DiscardDialog';
import {
  ChipRow, Chip, Crosshair, Loading, SaveStatus, TextBox, useToast,
} from '../components/design';

// The Journal runs in focus mode like every other tool (Polish 1, Tim's walk of Stage B, items 1 to 4): FormTool's
// ToolFrame gives × ("Close and save my place"), the day as the small grey label (no year for a day this year,
// writing rule 28), the question, Save journal at the foot and Save as draft and Discard as quiet links under it.
// The menu, My Mission and Breathe step aside. The prompts wait behind a quiet "Need a prompt?" link and show only
// when asked; the writing boxes sit in one column with the shared gap, the last one a tall page to write on.
const JOURNAL_CSS = `
.ui-root .jrn-ask { margin-top: var(--space-3); }
/* A quiet underlined link, as Save as draft and Discard under the foot (formTool.css .ft-link). */
.ui-root .jrn-ask .jrn-ask-link {
  color: var(--text-2);
  text-decoration: underline;
  text-decoration-thickness: var(--line-w);
  text-underline-offset: var(--space-1);
}
.ui-root .jrn-prompts {
  margin: var(--space-2) 0 0;
}
@media (max-width: 768px) {
  .ui-root .jrn-prompts {
    flex-direction: column;
    align-items: stretch;
  }
  /* The pill rule on phones (Tim, 23 Oct): the prompts become full-width rows, drawn like the answer lists. */
  .ui-root .jrn-prompts .ds-chip {
    display: flex;
    width: 100%;
    min-height: var(--row-min-h) !important;
    padding: var(--space-px12) var(--row-pad-x) !important;
    border-radius: var(--radius-field);
    font-size: var(--fs-option) !important;
  }
}
.ui-root .jrn-unknown {
  margin: 0 0 var(--space-3);
  font-size: var(--fs-note);
  line-height: var(--lh-text);
  color: var(--text-2);
}
.ui-root .jrn-paper-wrap {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-top: 0;
  padding-bottom: 0;
  border-top: 0;
  border-bottom: 0;
}
.ui-root .jrn-meta { display: flex; gap: var(--space-3); margin-top: var(--space-2); font-size: var(--fs-meta); color: var(--text-2); }
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
  // The old same-tab draft (sessionStorage), removed once the device
  // draft below has taken over.
  const legacyDraftKey = `clarity-journal-draft-${dateKey}`;

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
  const [promptsOpen, setPromptsOpen] = useState(false);
  const promptsId = useId();
  const [syncState, markQueued] = useQueuedSave();
  // Whether what is saved for this day is known (from the server or the
  // device's copy). If not, saving now could replace writing already
  // there, so the save waits until the day has loaded.
  const [serverKnown, setServerKnown] = useState(false);
  const savingRef = useRef(false);
  const toast = useToast();
  const lastInputRef = useRef(null);
  const focusLastRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const show = (row) => {
        setExistingId(row.id);
        setExistingStatus(row.status === 'draft' ? 'draft' : 'final');
        setBlocks(row.body?.length ? row.body : [textBlock('')]);
        setSaveStatus(row.status === 'draft' ? 'Draft saved' : 'Saved');
      };
      try {
        const row = await loadJournalByDate(user.id, dateKey);
        if (cancelled) return;
        // A copy on the device, so the day opens offline too.
        writeCache(user.id, `journal:${dateKey}`, row || null);
        setServerKnown(true);
        if (row) show(row);
      } catch (error) {
        console.error('[DailyJournal] load failed:', error);
        if (cancelled) return;
        // Offline: show the copy from the last visit, if there is one.
        const cached = readCache(user.id, `journal:${dateKey}`);
        if (cached) {
          setServerKnown(true);
          if (cached.v) show(cached.v);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, dateKey]);

  // Typing survives a refresh or a closed tab (Tim, 26 Oct): kept on the
  // device and put back quietly, with "Draft restored".
  const { clear: clearDraft } = useDraft({
    userId: user?.id,
    name: `journal:${dateKey}`,
    value: blocks,
    ready: !isLoading,
    onRestore: (v) => {
      if (Array.isArray(v) && v.length) {
        setBlocks(v);
        setSaveStatus('');
      }
    },
  });

  useEffect(() => {
    try { sessionStorage.removeItem(legacyDraftKey); } catch { /* ignore */ }
  }, [legacyDraftKey]);

  // A save that waited on the device has reached the server: the draft
  // can go. (A refused one keeps it, so the writing comes back.)
  useEffect(() => {
    if (syncState === 'saved') clearDraft();
  }, [syncState, clearDraft]);

  useEffect(() => {
    if (focusLastRef.current) {
      focusLastRef.current = false;
      lastInputRef.current?.focus();
    }
  }, [blocks]);

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
    const status = draft ? 'draft' : 'final';
    if (!serverKnown) {
      toast.error('This day hasn’t loaded, so saving now could replace what’s already there. Your writing is kept on this device; save it when you’re back online.');
      return null;
    }
    let saved;
    try {
      if (!isOnline()) throw new TypeError('Failed to fetch: offline');
      saved = await saveJournal({ userId: user.id, journalDate: dateKey, blocks, status, existingId });
    } catch (error) {
      if (!isNetworkError(error)) throw error;
      // No connection: keep it on the device and send it when the
      // connection is back ("Will sync", then "Saved"). One journal per
      // person per day, so sending it twice can never make two.
      const queued = await saveOrQueue(user.id, {
        table: 'daily_journals',
        kind: 'upsert',
        onConflict: 'user_id,journal_date',
        values: {
          user_id: user.id,
          journal_date: dateKey,
          body: blocks,
          body_text: textOf(blocks),
          status,
          updated_at: new Date().toISOString(),
        },
      });
      // The draft stays until the server has it (cleared below).
      markQueued(queued.qid);
      writeCache(user.id, `journal:${dateKey}`, { id: existingId, body: blocks, status });
      setExistingStatus(status);
      return { queued: true };
    }
    setExistingId(saved.id);
    setExistingStatus(status);
    writeCache(user.id, `journal:${dateKey}`, saved);
    clearDraft();
    return saved;
  };

  const handleSaveJournal = async () => {
    // A double tap starts one save, not two.
    if (isSaving || savingRef.current) return;
    savingRef.current = true;
    setIsSaving(true);
    try {
      const saved = await persist(false);
      // Kept on the device for now: stay here, showing "Will sync".
      if (saved && !saved.queued) navigate('/daily-journals', { state: { toast: 'Journal saved. It is in My Reviews too.' } });
    } catch (error) {
      console.error('[DailyJournal] save failed:', error);
      toast.error('That didn’t save. Check your connection and try again.');
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  const handleSaveDraft = async () => {
    // A double tap starts one save, not two.
    if (isSaving || savingRef.current) return;
    savingRef.current = true;
    setIsSaving(true);
    try {
      const saved = await persist(true);
      if (saved && !saved.queued) {
        setSaveStatus('Draft saved');
        toast.show('Draft saved.');
        navigate('/daily-journals');
      }
    } catch (error) {
      console.error('[DailyJournal] draft save failed:', error);
      toast.error('That didn’t save. Check your connection and try again.');
    } finally {
      savingRef.current = false;
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
    clearDraft();
    setBlocks([textBlock('')]);
    setExistingId(null);
    setExistingStatus(null);
    setSaveStatus('');
    navigate('/daily-journals', { state: { toast: 'Discarded.' } });
  };

  // The day as the small grey label: no year for a day this year (writing rule 28).
  const dayLabel = dateObj.getFullYear() === new Date().getFullYear()
    ? formatPlainDayLabel(dateObj)
    : `${formatPlainDayLabel(dateObj)} ${dateObj.getFullYear()}`;

  let lastTIndex = -1;
  blocks.forEach((b, i) => { if (b.t === 't') lastTIndex = i; });

  const choosePrompt = (p) => {
    handlePrompt(p);
    setPromptsOpen(false);
  };

  return (
    <div className="ui-root">
      <style>{JOURNAL_CSS}</style>
      <FormTool
        name={dayLabel}
        question={JOURNAL_QUESTION}
        onNext={() => { if (!isLoading) handleSaveJournal(); }}
        nextLabel="Save journal"
        onSaveDraft={() => { if (!isLoading) handleSaveDraft(); }}
        onDiscard={() => setDiscardOpen(true)}
        closeTo="/daily-journals"
        className="jrn-page"
      >
        {isLoading ? (
          <Loading label="Loading your journal" />
        ) : (
          <>
            {!serverKnown && (
              <p className="jrn-unknown" role="status">This day hasn’t loaded, so you can write now and save once you’re back online.</p>
            )}

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
              <SaveStatus state={isSaving ? 'saving' : (syncState !== 'idle' ? syncState : (saveStatus ? 'saved' : 'idle'))} />
            </div>

            {/* The prompts only when asked (the agreed design: a quiet link, never four boxes above the page). */}
            <div className="jrn-ask">
              <button type="button" className="ds-more ds-more--bare jrn-ask-link" aria-expanded={promptsOpen} aria-controls={promptsId} onClick={() => setPromptsOpen((v) => !v)}>Need a prompt?</button>
              <div id={promptsId} hidden={!promptsOpen}>
                {promptsOpen && (
                  <ChipRow className="jrn-prompts" label="Prompts">
                    {PROMPTS.map((p) => (
                      // An action, not an on/off choice, so no aria-pressed.
                      <Chip key={p} aria-pressed={undefined} onClick={() => choosePrompt(p)}>{p}</Chip>
                    ))}
                  </ChipRow>
                )}
              </div>
            </div>
          </>
        )}
      </FormTool>

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
