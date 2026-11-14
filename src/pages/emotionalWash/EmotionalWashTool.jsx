import { useEffect, useRef, useState } from 'react';
import {
  Chip,
  ChipRow,
  Choice,
  Dissolve,
  FollowChoice,
  FollowQuestion,
  GuidedSummary,
  GuidedTool,
  MultiChoice,
  RowList,
  TextBox,
  TodoWhere,
  WhoSees,
  useToast,
  useToolTodo,
} from '../../components/design';
import { newId } from '../../lib/syncQueue';
import { needsConnection } from '../../lib/friendlyError';
import {
  CHECK_ANSWERS,
  CHECK_KINDS,
  FOLLOW,
  KINDS,
  PLACEHOLDER,
  QUESTION_MAX,
  RELATED,
  STARTERS,
  STEP_MAX,
  STORY_EXAMPLE,
  THOUGHT_MAX,
  TODO_SOURCE,
  TOOL_NAME,
  WASHES,
  WHAT_MAX,
  WHERE,
  WORDS,
  countLine,
  firstUnanswered,
  nudge,
  percentAt,
  question,
  quoteWords,
  requiredMessage,
  sameTodo,
  setCheck,
  setThought,
  setWash,
  storyThoughts,
  strayTodos,
  summaryRows,
  wantedTodo,
  washSteps,
  withStoryRows,
  withTodo,
} from '../../lib/emotionalWash/model';
import './emotionalWash.css';

// Emotional wash (mock-up M10, version 5.6; read in full with its notes):
// one guided tool in the calm stepped frame. What happened, the kind of
// feeling, its words, what it could be related to, the story (one thought
// a box), then for each thought three one-tap checks (true, logical,
// helpful) and how it will be washed: Accept and act, Park and reflect or
// Trash, the follow-up opening inside the chosen card. Then "Your wash".
// The page around it owns the wash and saves it; this owns the screens.
//
//   wash, onWash(fn)   the wash (src/lib/emotionalWash/model.js) and its setter
//   sourceId           the saved item's id, for the to-dos made from it
//   onTodoGone(id)     a to-do replaced by an edit, or no longer wanted: the page deletes it
//   pdf                the "Download my PDF" link in the summary's bottom bar
//   onEdited           “Save my edit” went back to the summary: the page saves
//                      the wash as it stands and says so (“Saved”)
//   actions            “Delete”, for a wash opened from My Plans: under the
//                      summary, and under the first question while it is
//                      still a draft (`actionsFirst`)
//   draftKey, initialStep, onClose, onFinish   as GuidedTool's
//
// The eye shows on the first step and on the summary only (Tim, 13 Nov,
// 09:32), and has no choice: a wash is private, like the Journal. There is
// no strength rating anywhere. One-answer questions move straight on (rule
// 21), so they have no bottom bar; every typing step has Finish later at
// the left.

const WHO_NOTE = ['Only you can see this.', 'Your Emotional wash can’t be shared, like your Journal.'];
const NO_STRATEGY = ['Every to-do serves one of your Strategies.', 'Your plan has no Strategies yet, so there’s nothing to add this to.'];
const KIND_STEPS = 5; // what, kind, words, rel, story

// Runs `run` when the screen it is on goes.
function OnLeave({ run }) {
  const fn = useRef(run);
  fn.current = run;
  useEffect(() => () => fn.current?.(), []);
  return null;
}

// The summary with a question still open (a wash carried on from another
// device, or a thought added since): that question shows instead.
function Summary({ wash, tool }) {
  const missing = firstUnanswered(wash);
  useEffect(() => {
    if (!missing) return;
    const at = tool.steps.findIndex((s) => s.key === missing);
    if (at >= 0) tool.go(at);
    // Only when what's missing changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missing]);
  if (missing) return null;
  return (
    <GuidedSummary
      stacked
      rows={summaryRows(wash).map((r) => ({ ...r, step: tool.steps.findIndex((s) => s.key === r.step) }))}
      onChange={tool.go}
    />
  );
}

export default function EmotionalWashTool({
  wash,
  onWash,
  sourceId = null,
  onTodoGone,
  pdf = null,
  draftKey,
  initialStep,
  onClose,
  onFinish,
  onEdited,
  actions = null,
  actionsFirst = false,
}) {
  const toast = useToast();
  const todo = useToolTodo();
  // The thought whose words are lifting away right now.
  const [lifting, setLifting] = useState(null);
  // The thought a box held when it was taken out, for its Undo.
  const removed = useRef(null);
  const committing = useRef(new Set()); // one to-do per press

  const eye = <WhoSees audience="me" note={WHO_NOTE} />;

  // Where a step's to-do goes and which Strategy it serves, as the screen
  // shows them: what was chosen, else the usual start (this week while a
  // sprint runs), and the only Strategy when there is just one.
  const placeOf = (th) => {
    if (!todo.canAdd) return { where: WHERE.none, strategyId: null };
    const where = todo.whereOptions.some((o) => o.value === th.where) ? th.where : todo.startWhere;
    const strategyId = todo.strategies.some((s) => s.value === th.strategyId) ? th.strategyId : (todo.strategies.length === 1 ? todo.strategies[0].value : null);
    return { where, strategyId };
  };
  const adds = (th) => th.wash === 'act' && placeOf(th).where !== WHERE.none;

  const dropStrays = (now) => {
    for (const { thoughtId, id } of strayTodos(now)) {
      onTodoGone?.(id);
      onWash((w) => withTodo(w, thoughtId, null));
    }
  };

  // Next on a washing screen: the step's to-do is made, replaced or taken
  // away, so the summary only says where it is when it is there.
  const commit = async (th) => {
    if (committing.current.has(th.id)) return;
    // The person's Strategies aren't here yet (a first open on this device,
    // pressed before they loaded): nothing is decided for them. The step
    // keeps where it was to go, and its to-do is made when it is next saved.
    if (th.wash === 'act' && !todo.ready) return;
    const { where, strategyId } = placeOf(th);
    const now = th.wash === 'act' ? { ...th, where, strategyId } : th;
    if (th.wash === 'act') onWash((w) => setThought(w, th.id, { where, strategyId }));
    const wanted = wantedTodo(now);
    const made = wash.todos?.[th.id] || null;
    if (sameTodo(made, wanted)) return;
    if (made?.id) {
      onTodoGone?.(made.id);
      onWash((w) => withTodo(w, th.id, null));
    }
    if (!wanted || !wanted.strategyId) return;
    committing.current.add(th.id);
    try {
      const saved = await todo.add({
        text: wanted.text,
        strategyId: wanted.strategyId,
        where: wanted.where,
        source: TODO_SOURCE,
        sourceId,
        // The toast's Undo: the step stays, with nowhere to go.
        onUndone: ({ id }) => onWash((w) => (w.todos?.[th.id]?.id === id ? withTodo(setThought(w, th.id, { where: WHERE.none }), th.id, null) : w)),
      });
      if (saved?.id) onWash((w) => withTodo(w, th.id, { id: saved.id, text: wanted.text, where: saved.where, strategyId: wanted.strategyId }));
    } finally {
      committing.current.delete(th.id);
    }
  };

  const choose = (th, value) => {
    onWash((w) => setWash(w, th.id, value));
    setLifting(value === 'trash' && th.wash !== 'trash' ? th.id : null);
  };
  const lifted = (th) => {
    setLifting(null);
    toast.saved({
      message: 'Deleted',
      onUndo: () => {
        onWash((w) => setThought(w, th.id, { wash: null }));
        toast.show('The thought is back');
      },
    });
  };

  const follow = (th) => (value) => {
    if (value === 'act') {
      const { where, strategyId } = placeOf(th);
      return (
        <>
          <FollowQuestion label={FOLLOW.act.label} hint={FOLLOW.act.hint}>
            {({ labelId, hintId }) => (
              <TextBox
                lines="one"
                aria-labelledby={labelId}
                aria-describedby={hintId}
                maxLength={STEP_MAX}
                placeholder={PLACEHOLDER.step}
                value={th.step}
                onChange={(step) => onWash((w) => setThought(w, th.id, { step }))}
              />
            )}
          </FollowQuestion>
          {todo.canAdd ? (
            <>
              <TodoWhere options={todo.whereOptions} value={where} onChange={(to) => onWash((w) => setThought(w, th.id, { where: to }))} />
              {/* A to-do serves a Strategy: asked only when there is more than one to choose from. */}
              {where !== WHERE.none && todo.strategies.length > 1 && (
                <div className="ds-follow-also">
                  <Choice
                    label="Which Strategy does it serve?"
                    options={todo.strategies}
                    value={strategyId}
                    onChange={(id) => onWash((w) => setThought(w, th.id, { strategyId: id }))}
                    form="dropdown"
                  />
                </div>
              )}
            </>
          ) : (
            !todo.loading && (todo.ready ? NO_STRATEGY : [needsConnection('Adding a to-do')]).map((line) => <p key={line} className="ds-follow-note">{line}</p>)
          )}
        </>
      );
    }
    if (value === 'park') {
      return (
        <FollowQuestion label={FOLLOW.park.label} hint={FOLLOW.park.hint}>
          {({ labelId, hintId }) => (
            <StarterBox labelId={labelId} hintId={hintId} value={th.question} onChange={(q) => onWash((w) => setThought(w, th.id, { question: q }))} />
          )}
        </FollowQuestion>
      );
    }
    return null;
  };

  const thoughtSteps = washSteps(wash);
  const count = thoughtSteps.length / 4;
  const shownThoughts = storyThoughts(wash);

  const steps = [
    {
      key: 'what',
      name: 'What happened',
      question: question('what'),
      nudges: [nudge('what')],
      eye,
      percent: percentAt(0, count),
      check: () => requiredMessage('what', wash),
      render: () => (
        <>
          <TextBox
            ariaLabel={question('what')}
            maxLength={WHAT_MAX}
            value={wash.what}
            onChange={(what) => onWash((w) => ({ ...w, what }))}
          />
          {actionsFirst && actions}
        </>
      ),
    },
    {
      key: 'kind',
      name: 'Kind of feeling',
      question: question('kind'),
      nudges: [nudge('kind')],
      percent: percentAt(1, count),
      // One answer moves straight on (rule 21): no Next, and nothing to skip.
      oneTap: true,
      required: true,
      // "The feeling" on the summary is the kind, then its words.
      thenEdit: 'words',
      render: (tool) => (
        <Choice
          form="rows"
          tick
          ariaLabel={question('kind')}
          options={KINDS}
          value={wash.kind}
          onChange={(kind) => onWash((w) => ({ ...w, kind }))}
          onChoose={() => tool.next()}
        />
      ),
    },
    {
      key: 'words',
      name: 'Words',
      question: question('words'),
      nudges: [nudge('words')],
      percent: percentAt(2, count),
      check: () => requiredMessage('words', wash),
      render: () => (
        <MultiChoice
          columns
          ariaLabel={question('words')}
          options={WORDS.map((w) => ({ value: w, label: w }))}
          values={wash.words}
          onChange={(words) => onWash((w) => ({ ...w, words }))}
        />
      ),
    },
    {
      key: 'rel',
      name: 'Related to',
      question: question('rel'),
      nudges: [nudge('rel')],
      percent: percentAt(3, count),
      render: () => (
        <MultiChoice
          columns
          ariaLabel={question('rel')}
          options={RELATED.map((w) => ({ value: w, label: w }))}
          values={wash.rel}
          onChange={(rel) => onWash((w) => ({ ...w, rel }))}
        />
      ),
    },
    {
      key: 'story',
      name: 'The story',
      question: question('story'),
      nudges: [nudge('story')],
      example: STORY_EXAMPLE,
      percent: percentAt(4, count),
      check: () => requiredMessage('story', wash),
      onNext: () => dropStrays(wash),
      // A thought added later is washed before the summary shows again.
      onward: () => firstUnanswered(wash) || 'sum',
      render: () => (
        <RowList
          rows={shownThoughts.map((th) => th.text)}
          max={Infinity}
          maxLength={THOUGHT_MAX}
          removeAlways
          undo
          itemLabel={(n) => `Thought ${n}`}
          addLabel="Add another thought"
          onChange={(rows, change) => {
            if (change?.removed != null) removed.current = shownThoughts[change.removed] || null;
            const back = change?.restored != null ? removed.current : null;
            onWash((w) => withStoryRows(w, rows, change, newId, back));
          }}
        />
      ),
    },
    ...thoughtSteps.map((s, j) => {
      const th = s.thought;
      const common = { key: s.key, name: `Thought ${s.n}`, label: countLine(s.n, s.of), percent: percentAt(KIND_STEPS + j, count) };
      if (CHECK_KINDS.includes(s.kind)) {
        return {
          ...common,
          question: question(s.kind, th),
          nudges: [nudge(s.kind)],
          oneTap: true,
          required: true,
          render: (tool) => (
            <Choice
              form="rows"
              tick
              ariaLabel={question(s.kind, th)}
              options={CHECK_ANSWERS}
              value={th[s.kind]}
              onChange={(value) => onWash((w) => setCheck(w, th.id, s.kind, value))}
              onChoose={() => tool.next()}
            />
          ),
        };
      }
      const going = lifting === th.id && th.wash === 'trash';
      const gone = th.wash === 'trash' && !going;
      return {
        ...common,
        question: going
          ? <>How will you wash “<Dissolve text={quoteWords(th)} onDone={() => lifted(th)} />”?</>
          : question('w', th, { gone }),
        nudges: [nudge('w', { gone })],
        check: () => requiredMessage('w', wash, th, { needsStrategy: adds(th) && !placeOf(th).strategyId }),
        onNext: () => { commit(th); },
        render: () => (
          <>
            <OnLeave run={() => setLifting(null)} />
            <FollowChoice
              ariaLabel={question('w', th)}
              options={WASHES}
              value={th.wash}
              onChange={(value) => choose(th, value)}
              follow={follow(th)}
            />
          </>
        ),
      };
    }),
    {
      key: 'sum',
      name: 'Your wash',
      title: 'Your wash',
      eye,
      noProgress: true,
      className: 'ew-summary',
      footAside: pdf,
      render: (tool) => <><Summary wash={wash} tool={tool} />{!firstUnanswered(wash) && actions}</>,
    },
  ];

  return (
    <GuidedTool
      calm
      name={TOOL_NAME}
      steps={steps}
      progress="percent"
      finishLabel="Finish my wash"
      skipLabel="Finish later"
      skipMoves={false}
      onSkip={onClose}
      draftKey={draftKey}
      initialStep={initialStep}
      onClose={onClose}
      onFinish={onFinish}
      onEdited={onEdited || (() => toast.show('Saved'))}
    />
  );
}

// Park and reflect's box, with its three starters: tapping one fills the
// box, ready to be made the person's own (M10; Tim, 13 Nov, 10:41).
function StarterBox({ labelId, hintId, value, onChange }) {
  const box = useRef(null);
  const start = (words) => {
    onChange(words);
    requestAnimationFrame(() => {
      const el = box.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      el.setSelectionRange(el.value.length, el.value.length);
    });
  };
  return (
    <>
      <ChipRow label="Questions to start from">
        {STARTERS.map((words) => (
          <Chip key={words} pressed={value === words} onClick={() => start(words)}>{words}</Chip>
        ))}
      </ChipRow>
      <TextBox
        ref={box}
        lines="one"
        aria-labelledby={labelId}
        aria-describedby={hintId}
        maxLength={QUESTION_MAX}
        placeholder={PLACEHOLDER.question}
        value={value}
        onChange={onChange}
      />
    </>
  );
}
