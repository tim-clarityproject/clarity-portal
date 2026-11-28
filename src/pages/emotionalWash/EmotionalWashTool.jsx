import { useEffect, useId, useRef, useState } from 'react';
import {
  Choice,
  DatePicker,
  GuidedSummary,
  GuidedTool,
  MultiChoice,
  RowList,
  TextBox,
  TodoWhere,
  todayKey,
  useCoach,
  useToast,
  useToolTodo,
} from '../../components/design';
import { useStartChat } from '../../components/coach/startChat';
import { newId } from '../../lib/syncQueue';
import { needsConnection } from '../../lib/friendlyError';
import {
  CHOICES,
  FAMILIES,
  OWN_LABEL,
  OWN_MAX,
  STEP_MAX,
  STRENGTHS,
  THOUGHT_EXAMPLES,
  THOUGHT_MAX,
  TODO_SOURCE,
  TOOL_NAME,
  WHAT_MAX,
  WHERE,
  countLine,
  firstUncommitted,
  otherThoughts,
  question,
  requiredMessage,
  sameTodo,
  setChoice,
  setThought,
  storyOf,
  strayTodos,
  strengthLine,
  summaryRows,
  talkLine,
  thoughtSteps,
  wantedTodo,
  withFamily,
  withOtherRows,
  withStory,
  withTodo,
  wordsOf,
} from '../../lib/emotionalWash/model';
import './emotionalWash.css';

// Emotional wash (Polish 1, Stage D, 27 Nov: Draft 6's screens with Draft
// 7's word list; docs/rules/emotional-wash.md): one guided tool in focus
// mode. What happened, the family of the feeling (one tap), the word that
// fits best (with its meaning; Something else), how strong it is (one tap),
// what you're telling yourself, the other thoughts, then for each thought
// what you'll do with it (one tap), and for each one to act on what you'll
// do and when (the one screen that can't be skipped). Then "Your wash".
// The page around it owns the wash and saves it; this owns the screens.
//
//   wash, onWash(fn)   the wash (src/lib/emotionalWash/model.js) and its setter
//   sourceId           the saved item's id, for the to-dos made from it
//   onTodoGone(id)     a to-do replaced by an edit, or no longer wanted: the page deletes it
//   pdf                the "Download my PDF" link in the summary's bottom bar
//   onEdited           “Save my edit” went back to the summary: the page saves
//   actions            “Delete”, for a wash opened from My plans: under the
//                      summary, and under the first question while it is
//                      still a draft (`actionsFirst`)
//   draftKey, initialStep, onClose, onFinish   as GuidedTool's
//
// Private: no eye anywhere (Draft 6), and never shared. Nothing sits under a
// question but "See an example" on the other thoughts, and the chosen word
// under "How strong is it right now?" (Draft 7).

const NO_STRATEGY = ['Every to-do serves one of your Strategies.', 'Your plan has no Strategies yet, so there’s nothing to add this to.'];

// The summary with the one screen that can't be skipped still open (a wash
// carried on from another device, or a thought to act on added since): that
// screen shows instead.
function Summary({ wash, tool }) {
  const missing = firstUncommitted(wash);
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
      rows={summaryRows(wash).map((r) => ({ ...r, step: r.step ? tool.steps.findIndex((s) => s.key === r.step) : null }))}
      onChange={(to, opts) => { if (to != null && to >= 0) tool.go(to, opts); }}
    />
  );
}

// "Want to talk this through with Maya?" under Your wash (Draft 6; question
// rule 36): only where the person has a coach the portal can open a chat with.
function TalkThrough() {
  const coach = useCoach();
  const startChat = useStartChat();
  const line = talkLine(coach?.firstName);
  if (!line || !startChat) return null;
  return (
    <p className="ew-talk">
      <button type="button" className="ds-more ds-more--bare ew-talk-link" onClick={startChat}>{line}</button>
    </p>
  );
}

// The words of the chosen family, pick any, each with its meaning, then a
// quiet "Something else" opening a box for their own word (Draft 7).
function WordStep({ wash, onWash }) {
  const [ownOpen, setOwnOpen] = useState(() => Boolean(wash.own));
  const ownId = useId();
  return (
    <>
      <MultiChoice
        ariaLabel={question('words')}
        options={wordsOf(wash.family)}
        values={wash.words}
        onChange={(words) => onWash((w) => ({ ...w, words }))}
      />
      <div className="ew-own">
        <button
          type="button"
          className="ds-more ds-more--bare ew-own-link"
          aria-expanded={ownOpen}
          aria-controls={ownId}
          onClick={() => setOwnOpen((v) => !v)}
        >
          {OWN_LABEL}
        </button>
        <div id={ownId} hidden={!ownOpen}>
          {ownOpen && (
            <TextBox
              lines="one"
              ariaLabel="Your own word"
              maxLength={OWN_MAX}
              value={wash.own}
              onChange={(own) => onWash((w) => ({ ...w, own }))}
            />
          )}
        </div>
      </div>
    </>
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
  // The thought a box held when it was taken out, for its Undo.
  const removed = useRef(null);
  const committing = useRef(new Set()); // one to-do per press
  // To-dos made while the tool has been open: the sprint's rows may not
  // have caught up with them yet, so their place isn't second-guessed.
  const madeHere = useRef(new Set());

  // Where each step's to-do is now (the sprint page's own answer): the
  // summary never goes on saying "It’s in this week’s to-dos." once the
  // to-do has been deleted, moved, or left behind in an earlier week.
  const { placeOf: todoPlace } = todo;
  const placesKey = JSON.stringify(Object.entries(wash.todos || {})
    .map(([thoughtId, made]) => [thoughtId, made?.id, made?.id ? todoPlace(made.id) : null, made?.where ?? null])
    .filter(([, , place, where]) => place && place !== where));
  useEffect(() => {
    const moved = JSON.parse(placesKey).filter(([, id]) => !madeHere.current.has(id));
    if (!moved.length) return;
    onWash((w) => moved.reduce((now, [thoughtId, id, place]) => {
      const made = now.todos?.[thoughtId];
      if (!made || made.id !== id) return now;
      if (place === 'gone') return withTodo(setThought(now, thoughtId, { where: WHERE.none }), thoughtId, null);
      if (place === WHERE.week || place === WHERE.backlog) return withTodo(setThought(now, thoughtId, { where: place }), thoughtId, { ...made, where: place });
      return made.where == null ? now : withTodo(now, thoughtId, { ...made, where: null });
    }, w), { quiet: true });
  }, [placesKey, onWash]);

  // Where a step's to-do goes and which Strategy it serves, as the screen
  // shows them: what was chosen, else the usual start (this week while a
  // sprint runs), and the only Strategy when there is just one.
  const placeOf = (th) => {
    if (!todo.canAdd) return { where: WHERE.none, strategyId: null };
    const where = todo.whereOptions.some((o) => o.value === th.where) ? th.where : todo.startWhere;
    const strategyId = todo.strategies.some((s) => s.value === th.strategyId) ? th.strategyId : (todo.strategies.length === 1 ? todo.strategies[0].value : null);
    return { where, strategyId };
  };
  const adds = (th) => th.choice === 'act' && placeOf(th).where !== WHERE.none;

  const dropStrays = (now) => {
    for (const { thoughtId, id } of strayTodos(now)) {
      onTodoGone?.(id);
      onWash((w) => withTodo(w, thoughtId, null));
    }
  };

  // Next on a commit screen: the step's to-do is made, replaced or taken
  // away, so the summary only says where it is when it is there.
  const commit = async (th) => {
    if (committing.current.has(th.id)) return;
    if (!todo.ready) return;
    const { where, strategyId } = placeOf(th);
    const now = { ...th, where, strategyId };
    onWash((w) => setThought(w, th.id, { where, strategyId }));
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
      if (saved?.id) madeHere.current.add(saved.id);
      if (saved?.id) onWash((w) => withTodo(w, th.id, { id: saved.id, text: wanted.text, where: saved.where, strategyId: wanted.strategyId }));
    } finally {
      committing.current.delete(th.id);
    }
  };

  const steps4 = thoughtSteps(wash);
  const others = otherThoughts(wash);
  const story = storyOf(wash);
  const hasFamily = wordsOf(wash.family).length > 0;
  const line = strengthLine(wash);
  // "Step n of 9" by the kind of screen (Draft 6's nine screens, the summary the ninth), so the total stays steady
  // while thoughts are typed and chosen; each thought's own screens say "Thought 2 of 3" above the question (Stage D, P3).
  const SCREENS = { what: 1, family: 2, words: 3, strength: 4, story: 5, others: 6, d: 7, c: 8 };
  const placed = (step) => {
    const n = SCREENS[String(step.key).split(':')[0]];
    return n ? { ...step, place: { n, of: 9 } } : step;
  };

  const steps = [
    {
      key: 'what',
      name: 'What happened',
      question: question('what'),
      render: () => (
        <>
          <TextBox ariaLabel={question('what')} maxLength={WHAT_MAX} value={wash.what} onChange={(what) => onWash((w) => ({ ...w, what }))} />
          {actionsFirst && actions}
        </>
      ),
    },
    {
      key: 'family',
      name: 'The feeling',
      question: question('family'),
      oneTap: true,
      // "The feeling" on the summary is the family, then its words.
      thenEdit: 'words',
      render: (tool) => (
        <Choice
          form="rows"
          tick
          ariaLabel={question('family')}
          options={FAMILIES.map((f) => ({ value: f.value, label: f.label }))}
          value={wash.family}
          onChange={(family) => onWash((w) => withFamily(w, family))}
          onChoose={() => tool.next()}
        />
      ),
    },
    // The family's words show once a family is chosen.
    ...(hasFamily ? [{
      key: 'words',
      name: 'The word',
      question: question('words'),
      render: () => <WordStep wash={wash} onWash={onWash} />,
    }] : []),
    {
      key: 'strength',
      name: 'How strong',
      question: question('strength'),
      // The chosen word in the line under it (Draft 7).
      nudges: line ? [line] : undefined,
      oneTap: true,
      render: (tool) => (
        <Choice
          form="rows"
          tick
          ariaLabel={question('strength')}
          options={STRENGTHS}
          value={wash.strength}
          onChange={(strength) => onWash((w) => ({ ...w, strength }))}
          onChoose={() => tool.next()}
        />
      ),
    },
    {
      key: 'story',
      name: 'What you’re telling yourself',
      question: question('story'),
      render: () => (
        <TextBox ariaLabel={question('story')} maxLength={THOUGHT_MAX} value={story.text} onChange={(words) => onWash((w) => withStory(w, words))} />
      ),
    },
    {
      key: 'others',
      name: 'Other thoughts',
      question: question('others'),
      example: THOUGHT_EXAMPLES,
      onNext: () => dropStrays(wash),
      // A thought added later is asked about before the summary shows again.
      onward: () => {
        const next = thoughtSteps(wash).find((s) => (s.kind === 'd' ? !s.thought.choice : false));
        return next ? next.key : null;
      },
      render: () => (
        <RowList
          rows={others.map((th) => th.text)}
          max={Infinity}
          maxLength={THOUGHT_MAX}
          removeAlways
          undo
          itemLabel={(n) => `Thought ${n}`}
          addLabel="Add another thought"
          onChange={(rows, change) => {
            if (change?.removed != null) removed.current = others[change.removed] || null;
            const back = change?.restored != null ? removed.current : null;
            onWash((w) => withOtherRows(w, rows, change, newId, back));
          }}
        />
      ),
    },
    ...steps4.map((s) => {
      const th = s.thought;
      if (s.kind === 'd') {
        return {
          key: s.key,
          name: `Thought ${s.n}`,
          label: countLine(s.n, s.of) || undefined,
          question: question('d', th),
          oneTap: true,
          render: (tool) => (
            <Choice
              form="rows"
              tick
              ariaLabel={question('d', th)}
              options={CHOICES}
              value={th.choice}
              onChange={(value) => onWash((w) => setChoice(w, th.id, value))}
              onChoose={() => tool.next()}
            />
          ),
        };
      }
      const { where, strategyId } = placeOf(th);
      return {
        key: s.key,
        name: `Your step ${s.n}`,
        label: countLine(s.n, s.of) || undefined,
        question: question('c', th),
        // The commit question: the one screen that can't be skipped (question rule 34).
        required: true,
        check: () => requiredMessage('c', th, { needsStrategy: adds(th) && !strategyId }),
        onNext: () => { commit(th); },
        render: () => (
          <div className="ew-commit">
            <TextBox
              lines="one"
              ariaLabel={question('c', th)}
              maxLength={STEP_MAX}
              value={th.step}
              onChange={(step) => onWash((w) => setThought(w, th.id, { step }))}
            />
            <DatePicker
              label="When"
              value={th.when}
              min={todayKey()}
              onChange={(when) => onWash((w) => setThought(w, th.id, { when }))}
            />
            {todo.canAdd ? (
              <>
                <TodoWhere options={todo.whereOptions} value={where} onChange={(to) => onWash((w) => setThought(w, th.id, { where: to }))} />
                {where !== WHERE.none && todo.strategies.length > 1 && (
                  <Choice
                    label="Which Strategy does it serve?"
                    options={todo.strategies}
                    value={strategyId}
                    onChange={(id) => onWash((w) => setThought(w, th.id, { strategyId: id }))}
                    form="dropdown"
                  />
                )}
              </>
            ) : (
              !todo.loading && (todo.ready ? NO_STRATEGY : [needsConnection('Adding a to-do')]).map((words) => <p key={words} className="ds-follow-note">{words}</p>)
            )}
          </div>
        ),
      };
    }),
    {
      key: 'sum',
      name: 'Your wash',
      title: 'Your wash',
      noProgress: true,
      className: 'ew-summary',
      footAside: pdf,
      check: () => (firstUncommitted(wash) ? requiredMessage('c', {}) : null),
      render: (tool) => (
        <>
          <Summary wash={wash} tool={tool} />
          {!firstUncommitted(wash) && <TalkThrough />}
          {!firstUncommitted(wash) && actions}
        </>
      ),
    },
  ];

  return (
    <GuidedTool
      calm
      name={TOOL_NAME}
      steps={steps.map(placed)}
      finishLabel="Finish my wash"
      draftKey={draftKey}
      initialStep={initialStep}
      onClose={onClose}
      onFinish={onFinish}
      onEdited={onEdited || (() => toast.show('Saved'))}
    />
  );
}
