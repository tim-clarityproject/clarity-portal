import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AddButton, Button, Dropdown, SaveStatus, Section, TextBox, useToast } from '../design';
import { SegmentedControl } from '../design/Controls';
import { newId } from '../../lib/syncQueue';
import { friendlyError } from '../../lib/friendlyError';
import {
  ANSWER_TYPES,
  DEFAULT_SCALE,
  MAX_PER_TOOL,
  SCALE_OPTIONS,
  TOOLS,
  WORDING_MAX,
  cleanWording,
  exampleFor,
  hasWords,
  hintFor,
  kindLine,
  placesLine,
  questionsFor,
  suggestedBy,
  waitingSuggestions,
} from '../../lib/ownQuestions/model';
import {
  addSuggestion,
  decideSuggestion,
  deleteQuestion,
  restoreQuestion,
  saveQuestion,
  useOwnQuestions,
} from '../../lib/ownQuestions/store';
import './ownQuestions.css';

// My Account, "Your own questions" (mock-up "Your own questions", version
// 3: Settings screens). Up to 2 a tool, "1 of 2", Add question in the Add
// row, editing inside the row (no separate box, rule 29k), saving by itself
// with "Saved" (no Save button), Delete this question with Undo, the help
// line per tool, the worry line for the Daily plan (advice only), the
// 120-character limit with a count only in the last 20, and the rating's
// follow-up "Which words fit your question?" (the branded drop-down: a
// panel from the bottom on a phone). A coach's suggestion waits in its
// tool's place with Add it and Not now; the coach is never told.

const SAVE_AFTER_MS = 600;
const SAVE_ERROR = 'That didn’t save. Check your connection and try again.';
const FULL = 'Both places are taken now, so delete one to make room.';

export default function OwnQuestionsSection({ userId, role }) {
  const own = useOwnQuestions(userId);
  const toast = useToast();
  const location = useLocation();
  const [open, setOpen] = useState(null); // { id, tool, isNew }
  const sectionRef = useRef(null);

  // Home's link opens Settings at the suggestion.
  useEffect(() => {
    if (location.hash !== '#own-questions') return;
    const el = sectionRef.current?.querySelector('.oq-sugg') || sectionRef.current;
    el?.scrollIntoView?.({ block: 'center' });
  }, [location.hash, own.checked]);

  const remove = async (q) => {
    setOpen(null);
    try {
      await deleteQuestion(userId, q.id);
    } catch (e) {
      toast.error(friendlyError(e, SAVE_ERROR));
      return;
    }
    toast.saved({
      message: 'Deleted',
      onUndo: async () => {
        const r = await restoreQuestion(userId, q.id).catch(() => 'refused');
        if (r === 'full') toast.show(FULL);
      },
    });
  };

  return (
    <div ref={sectionRef}>
      <Section id="own-questions" title="Your own questions" className="ipp-section account-section oq-section">
        {TOOLS.map((tool) => {
          const adding = open?.isNew && open.tool === tool.key;
          const all = questionsFor(own.questions, tool.key);
          // A new question, once kept, stays in its open form at the end until it closes.
          const questions = adding ? all.filter((q) => q.id !== open.id) : all;
          const suggestion = waitingSuggestions(own.suggestions, tool.key)[0] || null;
          // A suggestion takes the free place while it waits.
          const room = questions.length + (suggestion ? 1 : 0) < MAX_PER_TOOL;
          const stray = own.questions.filter((q) => q.tool === tool.key && q.refused === 'full' && !q.deletedAt);
          return (
            <div key={tool.key} className="oq-tool">
              <div className="oq-tool-head">
                <p className="oq-tool-name">{tool.name}</p>
                <span className="oq-places">{placesLine(all.length)}</span>
              </div>
              {questions.map((q) => (open?.id === q.id ? (
                <QuestionForm
                  key={q.id}
                  userId={userId}
                  role={role}
                  question={q}
                  onDelete={() => remove(q)}
                  onDone={() => setOpen(null)}
                />
              ) : (
                <button key={q.id} type="button" className="oq-row" aria-label={`Edit “${q.wording}”`} onClick={() => setOpen({ id: q.id, tool: tool.key })}>
                  <span className="oq-row-q">{q.wording}</span>
                  <span className="oq-row-k">{kindLine(q)}</span>
                </button>
              )))}
              {stray.map((q) => (
                <div key={q.id} className="oq-stray">
                  <p className="oq-row-q">{q.wording}</p>
                  <p className="oq-hint">This one wasn’t kept: {tool.inSentence} already has 2 questions from another tab or device.</p>
                  <Button variant="text" onClick={() => remove(q)}>Delete this question</Button>
                </div>
              ))}
              {suggestion && (
                <Suggestion
                  userId={userId}
                  suggestion={suggestion}
                  questions={questions}
                  onAdded={(r) => {
                    if (r === 'full') toast.show(FULL);
                    else if (r !== 'refused') toast.show('Added');
                  }}
                />
              )}
              {adding && (
                <QuestionForm
                  key={open.id}
                  userId={userId}
                  role={role}
                  question={{ id: open.id, tool: tool.key, wording: '', answerType: 'written', scale: null }}
                  isNew
                  onDone={() => setOpen(null)}
                />
              )}
              {room && !adding && (
                <AddButton className="oq-add" onClick={() => setOpen({ id: newId(), tool: tool.key, isNew: true })}>Add question</AddButton>
              )}
            </div>
          );
        })}
      </Section>
    </div>
  );
}

/** A question opened inside its tool: it saves by itself as it is typed. */
function QuestionForm({ userId, role, question, isNew = false, onDelete, onDone }) {
  const toast = useToast();
  const [draft, setDraft] = useState(() => ({
    wording: question.wording || '',
    answerType: question.answerType || 'written',
    scale: question.scale || null,
  }));
  const [save, setSave] = useState('idle');
  const timer = useRef(null);
  const latest = useRef(draft);
  const formRef = useRef(null);
  const boxId = `oq-box-${question.id}`;

  // An inline edit opens with the cursor at the end (rule 4a).
  useEffect(() => {
    const box = document.getElementById(boxId);
    if (!box) return;
    box.focus();
    const end = box.value?.length || 0;
    try { box.setSelectionRange(end, end); } catch { /* not a text box */ }
  }, [boxId]);

  const send = async (d) => {
    if (!hasWords(d.wording)) {
      setSave('idle');
      return;
    }
    setSave('saving');
    try {
      const r = await saveQuestion(userId, { ...question, ...d, wording: cleanWording(d.wording).trim() });
      if (r === 'full') {
        setSave('idle');
        toast.show(FULL);
        onDone();
        return;
      }
      setSave(r === 'queued' ? 'offline' : r === 'refused' ? 'failed' : 'saved');
    } catch (e) {
      setSave('idle');
      toast.error(friendlyError(e, SAVE_ERROR));
    }
  };

  const change = (patch) => {
    const next = { ...latest.current, ...patch };
    if (patch.answerType === 'rating' && !next.scale) next.scale = DEFAULT_SCALE;
    if (patch.answerType && patch.answerType !== 'rating') next.scale = null;
    latest.current = next;
    setDraft(next);
    clearTimeout(timer.current);
    // A choice saves at once; typing a moment after it pauses.
    if (patch.wording === undefined) send(next);
    else {
      setSave(hasWords(next.wording) ? 'saving' : 'idle');
      timer.current = setTimeout(() => send(latest.current), SAVE_AFTER_MS);
    }
  };

  // Leaving the question sends what waits.
  useEffect(() => () => {
    if (timer.current) {
      clearTimeout(timer.current);
      if (hasWords(latest.current.wording)) saveQuestion(userId, { ...question, ...latest.current, wording: cleanWording(latest.current.wording).trim() }).catch(() => null);
    }
  }, []);

  // Clicking away closes it (an empty new one is simply not kept).
  useEffect(() => {
    const away = (e) => {
      if (formRef.current && !formRef.current.contains(e.target) && !e.target.closest?.('.ds-dropdown-panel, .ds-sheet, [role="listbox"], .ds-toast')) onDone();
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [onDone]);

  return (
    <div ref={formRef} className="oq-open">
      <div>
        <TextBox
          id={boxId}
          label="What’s your question?"
          lines="one"
          maxLength={WORDING_MAX}
          value={draft.wording}
          onChange={(wording) => change({ wording: cleanWording(wording) })}
          placeholder={exampleFor(question.tool, role)}
        />
        <p className="oq-hint">{hintFor(question.tool, draft.wording)}</p>
      </div>
      <div>
        <p className="oq-flabel" id={`oq-how-${question.id}`}>How will you answer it?</p>
        <SegmentedControl
          label="How will you answer it?"
          options={ANSWER_TYPES}
          value={draft.answerType}
          onChange={(answerType) => change({ answerType })}
        />
        {draft.answerType === 'rating' && (
          <div className="oq-scale">
            <Dropdown
              label="Which words fit your question?"
              options={SCALE_OPTIONS}
              value={draft.scale || DEFAULT_SCALE}
              onChange={(scale) => change({ scale })}
            />
          </div>
        )}
      </div>
      <div className="oq-rowend">
        {!isNew && onDelete ? <Button variant="text" onClick={onDelete}>Delete this question</Button> : <span />}
        <SaveStatus state={save} />
      </div>
    </div>
  );
}

/** A question the coach suggested: Add it or Not now. With 2 there, Add it offers Replace beside each. */
function Suggestion({ userId, suggestion, questions, onAdded }) {
  const toast = useToast();
  const [replacing, setReplacing] = useState(false);
  const full = questions.length >= MAX_PER_TOOL;
  const add = async (replace = null) => {
    try {
      const r = await addSuggestion(userId, suggestion.id, { replace });
      onAdded(r);
    } catch (e) {
      toast.error(friendlyError(e, SAVE_ERROR));
    }
  };
  const notNow = async () => {
    try {
      await decideSuggestion(userId, suggestion.id, 'not_now');
    } catch (e) {
      toast.error(friendlyError(e, SAVE_ERROR));
    }
  };
  return (
    <div className="oq-sugg">
      <p className="oq-sugg-by">{suggestedBy(suggestion)}</p>
      <p className="oq-row-q">{suggestion.wording}</p>
      <p className="oq-row-k">{kindLine(suggestion)}</p>
      {replacing ? (
        <div className="oq-replace">
          <p className="oq-hint">Which question should it replace?</p>
          {questions.map((q) => (
            <div key={q.id} className="oq-replace-row">
              <span className="oq-row-q">{q.wording}</span>
              <Button onClick={() => add(q.id)}>Replace</Button>
            </div>
          ))}
          <Button variant="text" onClick={() => setReplacing(false)}>Keep both</Button>
        </div>
      ) : (
        <div className="oq-sugg-acts">
          <Button onClick={() => (full ? setReplacing(true) : add())}>Add it</Button>
          <Button variant="text" onClick={notNow}>Not now</Button>
        </div>
      )}
    </div>
  );
}
