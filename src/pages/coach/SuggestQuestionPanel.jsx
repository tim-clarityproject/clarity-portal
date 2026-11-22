import { useEffect, useState } from 'react';
import { Button, Dropdown, SlidePanel, TextBox, useToast } from '../../components/design';
import { SegmentedControl } from '../../components/design/Controls';
import { friendlyError } from '../../lib/friendlyError';
import {
  ANSWER_TYPES,
  DEFAULT_SCALE,
  SCALE_OPTIONS,
  TOOLS,
  WORDING_MAX,
  cleanWording,
  hasWords,
  hintFor,
} from '../../lib/ownQuestions/model';
import { suggestQuestion } from '../../lib/ownQuestions/store';
import '../../components/ownQuestions/ownQuestions.css';

// Suggest a question (mock-up "Your own questions", version 3: the coach
// portal's side panel, from a client's page under More). The coach picks
// the tool, writes the question and how it's answered, and presses Suggest.
// Nothing reaches the client's tools until they add it, and the coach is
// never told what they chose. The client's first name comes from the data.

const TOOL_OPTIONS = TOOLS.map((t) => ({ value: t.key, label: t.name }));
const empty = () => ({ tool: 'daily_review', wording: '', answerType: 'written', scale: null });

export default function SuggestQuestionPanel({ open, onClose, clientUserId, first }) {
  const toast = useToast();
  const [form, setForm] = useState(empty);
  const [problem, setProblem] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setForm(empty()); setProblem(null); } }, [open]);
  const set = (patch) => {
    setProblem(null);
    setForm((f) => {
      const next = { ...f, ...patch };
      if (patch.answerType === 'rating' && !next.scale) next.scale = DEFAULT_SCALE;
      if (patch.answerType && patch.answerType !== 'rating') next.scale = null;
      return next;
    });
  };
  const send = async () => {
    if (busy) return;
    // Never a greyed-out button: a calm line says what is needed.
    if (!hasWords(form.wording)) { setProblem('Type the question to carry on.'); return; }
    setBusy(true);
    try {
      const r = await suggestQuestion({ clientUserId, ...form });
      if (r === 'offline') { setProblem('Suggesting needs a connection, so try again when you’re back online.'); return; }
      if (r === 'needs_055') { setProblem('This needs the portal’s next database update first. Nothing was sent.'); return; }
      toast.saved({ message: `Suggested to ${first}`, long: true });
      onClose();
    } catch (e) {
      setProblem(friendlyError(e, 'That didn’t send. Check your connection and try again.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <SlidePanel
      open={open}
      onClose={onClose}
      title="Suggest a question"
      footer={<div className="cc-panel-foot cc-panel-foot--end"><Button variant="primary" onClick={send}>{`Suggest it to ${first}`}</Button></div>}
    >
      <div className="oq-panel">
        <Dropdown label="Which tool is it for?" options={TOOL_OPTIONS} value={form.tool} onChange={(tool) => set({ tool })} />
        <div>
          <TextBox label="What’s the question?" maxLength={WORDING_MAX} value={form.wording} onChange={(w) => set({ wording: cleanWording(w) })} />
          {hintFor(form.tool, form.wording) !== hintFor(form.tool, '') && <p className="oq-hint">{hintFor(form.tool, form.wording)}</p>}
        </div>
        <div>
          <p className="oq-flabel">{`How will ${first} answer it?`}</p>
          <SegmentedControl label={`How will ${first} answer it?`} options={ANSWER_TYPES} value={form.answerType} onChange={(answerType) => set({ answerType })} />
          {form.answerType === 'rating' && (
            <div className="oq-scale">
              <Dropdown label={`Which words fit the question?`} options={SCALE_OPTIONS} value={form.scale || DEFAULT_SCALE} onChange={(scale) => set({ scale })} />
            </div>
          )}
        </div>
        <p className="oq-hint oq-hint--flat">{`${first} chooses whether to add it.`}</p>
        {problem && <p className="ds-error" role="alert"><span className="ds-error-mark" aria-hidden="true">!</span><span>{problem}</span></p>}
      </div>
    </SlidePanel>
  );
}
