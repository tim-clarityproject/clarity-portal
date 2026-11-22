import { useEffect, useRef, useState } from 'react';
import { Button, Choice, Section, TextBox, useToast } from '../design';
import { friendlyError } from '../../lib/friendlyError';
import {
  ANSWER_MAX,
  answerWords,
  daySummaryRows,
  occasionOf,
  questionsFor,
  scaleOf,
  weekSummaryRows,
} from '../../lib/ownQuestions/model';
import { saveAnswer, useOwnQuestions } from '../../lib/ownQuestions/store';
import { formatSavedDate } from '../../lib/dateFormatter';
import './ownQuestions.css';

// A person's own questions inside the Daily plan, the Daily review and the
// weekly debrief (mock-up "Your own questions", version 3). They come last,
// just before the summary, one per screen, with the small grey line "Your
// own question". Written has Next, which works with nothing typed; Yes or
// no and A rating move straight on when tapped (rule 21), with "Skip this
// one" under the answers. Someone with no own questions gets no steps and
// no summary section: the tools are exactly as before.
//
//   const own = useOwnToolSteps(userId, 'daily_review', { date });
//   steps = [...core, ...own.steps, summary]
//   own.summary (or null) at the end of the summary.

const SAVE_AFTER_MS = 700;
const SAVE_ERROR = 'That didn’t save. Check your connection and try again.';

/** The tool's own-question steps and its summary section, for one day or sprint week. */
export function useOwnToolSteps(userId, tool, when) {
  const own = useOwnQuestions(userId);
  // The questions as the tool opened: one deleted or added in Settings
  // meanwhile never moves the screens under someone answering. A device
  // that had none yet takes the account's once they arrive.
  const [frozen, setFrozen] = useState(() => questionsFor(own.questions, tool));
  const adopted = useRef(frozen.length > 0);
  useEffect(() => {
    if (adopted.current || !own.checked) return;
    adopted.current = true;
    const now = questionsFor(own.questions, tool);
    if (now.length) setFrozen(now);
  }, [own.checked, own.questions, tool]);
  // The words follow an edit made before this question is answered.
  const questions = frozen.map((q) => own.questions.find((x) => x.id === q.id && !x.deletedAt) || q);
  const occasion = occasionOf(tool, when);
  const answerOf = (q) => own.answers.find((a) => a.questionId === q.id && a.occasion === occasion) || null;

  const steps = occasion ? questions.map((q) => ownStep({ userId, q, when, answer: answerOf(q) })) : [];

  let summary = null;
  if (occasion) {
    const rows = tool === 'weekly_debrief'
      ? weekSummaryRows(own.questions, own.answers, when)
      : daySummaryRows(own.questions, own.answers, tool, occasion);
    if (rows.length) summary = <OwnAnswers rows={rows} />;
  }
  return { steps, summary, count: steps.length };
}

function ownStep({ userId, q, when, answer }) {
  const base = {
    key: `own-${q.id}`,
    name: 'Your own question',
    label: 'Your own question',
    question: q.wording,
  };
  if (q.answerType === 'written') {
    return {
      ...base,
      // Next works with nothing typed, so they never hold anyone up; no Skip.
      required: true,
      render: () => <WrittenAnswer key={q.id} userId={userId} q={q} when={when} saved={answer?.written || ''} />,
    };
  }
  const options = q.answerType === 'yes_no'
    ? [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]
    : scaleOf(q.scale).words.map((w, i) => ({ value: String(i + 1), label: w }));
  const value = !answer ? null : q.answerType === 'yes_no' ? (answer.yesNo ? 'yes' : 'no') : answer.rating ? String(answer.rating) : null;
  return {
    ...base,
    oneTap: true,
    skipLabel: 'Skip this one',
    render: (tool) => <TapAnswer userId={userId} q={q} when={when} value={value} options={options} onChoose={() => tool.next()} />,
  };
}

function TapAnswer({ userId, q, when, value, options, onChoose }) {
  const toast = useToast();
  const [shown, setShown] = useState(value);
  useEffect(() => { setShown(value); }, [value]);
  const choose = (v) => {
    setShown(v);
    const stored = q.answerType === 'yes_no' ? v === 'yes' : Number(v);
    saveAnswer(userId, q, when, stored).catch((e) => toast.error(friendlyError(e, SAVE_ERROR)));
  };
  return (
    <Choice
      ariaLabel={q.wording}
      form="rows"
      options={options}
      value={shown}
      onChange={choose}
      onChoose={onChoose}
    />
  );
}

function WrittenAnswer({ userId, q, when, saved }) {
  const toast = useToast();
  const [text, setText] = useState(saved);
  const timer = useRef(null);
  const latest = useRef(saved);
  const send = (t) => saveAnswer(userId, q, when, t).catch((e) => toast.error(friendlyError(e, SAVE_ERROR)));
  // Leaving the screen sends what waits.
  useEffect(() => () => {
    if (timer.current) {
      clearTimeout(timer.current);
      send(latest.current);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <TextBox
      ariaLabel="Your answer"
      maxLength={ANSWER_MAX}
      value={text}
      onChange={(t) => {
        setText(t);
        latest.current = t;
        clearTimeout(timer.current);
        timer.current = setTimeout(() => { timer.current = null; send(t); }, SAVE_AFTER_MS);
      }}
    />
  );
}

/** "Your own questions" at the end of a summary: the question in grey, the answer under it. */
function OwnAnswers({ rows }) {
  return (
    <div className="oq-answers">
      <Section title="Your own questions" as="h3" className="oq-answers-section">
        {rows.map((r) => <OwnAnswerRow key={r.id} row={r} />)}
      </Section>
    </div>
  );
}

function OwnAnswerRow({ row }) {
  const [open, setOpen] = useState(false);
  const id = `oq-read-${row.id}`;
  return (
    <div className="oq-answer">
      <p className="oq-answer-q">{row.label}</p>
      <p className="oq-answer-a">{row.value}</p>
      {row.answers && (
        <>
          <Button variant="text" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
            {open ? 'Hide your answers' : 'Read your answers'}
          </Button>
          {open && (
            <div id={id} className="oq-read">
              {row.answers.map((a) => (
                <div key={a.date}>
                  <p className="oq-read-day">{formatSavedDate(a.date)}{a.wording !== row.label ? `, “${a.wording}”` : ''}</p>
                  <p className="oq-answer-a">{a.text}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export { answerWords };
