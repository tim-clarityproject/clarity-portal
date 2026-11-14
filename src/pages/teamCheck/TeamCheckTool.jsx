import { useEffect, useRef, useState } from 'react';
import {
  AddButton,
  Button,
  ChartTable,
  Choice,
  ErrorMessage,
  GuidedTool,
  NameRows,
  ResultsHeadline,
  ResultsSection,
  SlidePanel,
  StartQuestions,
  StepBarRows,
  StepBars,
  TextField,
  ToolTodoPanel,
  WhoSees,
  useCoach,
  useToast,
} from '../../components/design';
import { newId } from '../../lib/syncQueue';
import {
  NAME_MAX,
  PEOPLE_MAX,
  QUESTIONS_TITLE,
  REQUIRED,
  ROLE_MAX,
  TODO_SOURCE,
  TOOL_NAME,
  addPerson,
  countLine,
  firstUnanswered,
  headline,
  isComplete,
  nudge,
  options,
  percentAt,
  question,
  ratingSteps,
  removePerson,
  requiredMessage,
  restorePerson,
  setRating,
  startQuestions,
  tableRows,
  trustRows,
} from '../../lib/teamCheck/model';
import TeamChart from './TeamChart';
import './teamCheck.css';

// Team performance check (mock-up M10, version 5.6; read in full with its
// notes): one guided tool in the calm stepped frame. Who reports to you,
// then three one-tap questions for each person (trust, alignment,
// autonomy), then "Your team". The page around it owns the check and
// saves it; this owns the screens.
//
//   check, onCheck(fn)  the check (src/lib/teamCheck/model.js) and its setter
//   onShare(shared)     saves who can see it (with a coach)
//   sourceId            the saved item's id, for the to-dos made from it
//   pdf                 the "Download my PDF" link in the results' bottom bar
//   onResults()         the results are showing with every answer in: the page saves it
//   draftKey, initialStep, onClose   as GuidedTool's
//
// The eye shows on the first step and on the results only (Tim, 13 Nov,
// 09:32). One-answer questions move straight on (rule 21), so they have no
// bottom bar. "Add a to-do" is the results' one coral button; it opens the
// shared add panel ("Where should it go?", rule 31).

const TABLE_COLUMNS = [
  { key: 'person', label: 'Person' },
  { key: 'alignment', label: 'Alignment' },
  { key: 'autonomy', label: 'Autonomy' },
];

// Runs once the results are on screen: with an answer missing (a list
// edited on another device) it goes to that question instead.
function Results({ check, tool, onResults, onEditList }) {
  const complete = isComplete(check);
  const missing = complete ? null : firstUnanswered(check);
  const reached = useRef(false);
  useEffect(() => {
    if (complete) {
      if (!reached.current) {
        reached.current = true;
        onResults?.();
      }
      return;
    }
    const at = missing ? tool.steps.findIndex((s) => s.key === missing) : 0;
    tool.go(Math.max(0, at));
    // Only when what's missing changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complete, missing]);
  if (!complete) return null;
  const rows = tableRows(check);
  return (
    <>
      <ResultsSection first>
        <ResultsHeadline>{headline(check)}</ResultsHeadline>
      </ResultsSection>
      <ResultsSection title="Alignment and autonomy">
        <TeamChart check={check} />
        <ChartTable
          link
          rowHead
          caption="Alignment and autonomy, one row for each person"
          columns={TABLE_COLUMNS}
          rows={rows.map((r) => ({
            key: r.id,
            cells: {
              person: <><b>{r.name}</b>{r.role && <small>{r.role}</small>}</>,
              alignment: <StepBars value={r.alignment.value} tone={r.alignment.tone} word={r.alignment.word} />,
              autonomy: <StepBars value={r.autonomy.value} tone={r.autonomy.tone} word={r.autonomy.word} />,
            },
          }))}
        />
      </ResultsSection>
      <ResultsSection title="Trust">
        <StepBarRows rows={trustRows(check).map((r) => ({ id: r.id, title: r.name, sub: r.role, value: r.value, word: r.word, tone: r.tone, label: r.label }))} />
        <div className="ds-results-link">
          <Button variant="text" onClick={onEditList}>Edit who’s on the list</Button>
        </div>
      </ResultsSection>
      <StartQuestions title={QUESTIONS_TITLE} questions={startQuestions(check).map((q) => q.text)} />
    </>
  );
}

function AddPersonPanel({ open, onClose, onAdd }) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [asked, setAsked] = useState(false);
  const nameRef = useRef(null);
  // Each opening starts empty.
  const [was, setWas] = useState(open);
  if (open !== was) {
    setWas(open);
    if (open) { setName(''); setRole(''); setAsked(false); }
  }
  const add = () => {
    if (!name.trim()) {
      setAsked(true);
      nameRef.current?.focus();
      return;
    }
    onAdd({ name, role });
  };
  const onEnter = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); add(); }
  };
  return (
    <SlidePanel
      open={open}
      onClose={onClose}
      title="Add a person"
      initialFocusRef={nameRef}
      footer={<Button variant="primary" onClick={add}>Add this person</Button>}
    >
      <div className="tpc-add-form">
        <TextField ref={nameRef} label="What’s their name?" placeholder="e.g. Sam Carter" autoComplete="off" maxLength={NAME_MAX} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={onEnter} />
        <TextField label="What’s their role?" placeholder="e.g. Head of Marketing" autoComplete="off" maxLength={ROLE_MAX} value={role} onChange={(e) => setRole(e.target.value)} onKeyDown={onEnter} />
        {/* Never a greyed-out button: a calm line says what is needed (M10). */}
        {asked && !name.trim() && <ErrorMessage>{REQUIRED.name}</ErrorMessage>}
      </div>
    </SlidePanel>
  );
}

export default function TeamCheckTool({
  check,
  onCheck,
  onShare,
  sourceId = null,
  pdf = null,
  onResults,
  draftKey,
  initialStep,
  onClose,
}) {
  const coach = useCoach();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [todoOpen, setTodoOpen] = useState(false);

  const eye = coach && onShare ? (
    <WhoSees plain audience={check.shared ? 'coach' : 'me'} line="The people you rate never see it." onChange={(audience) => onShare(audience === 'coach')} />
  ) : (
    <WhoSees audience="me" />
  );

  const people = check.people;
  const remove = (row, index) => {
    const person = people.find((p) => p.id === row.id);
    if (!person) return;
    onCheck((c) => removePerson(c, person.id));
    toast.saved({ message: 'Deleted', onUndo: () => onCheck((c) => restorePerson(c, person, index)) });
  };

  const ratings = ratingSteps(check);
  const steps = [
    {
      key: 'people',
      name: 'Who reports to you',
      question: question('people'),
      nudges: [nudge('people')],
      eye,
      percent: 0,
      check: () => requiredMessage(check),
      // Someone added from the results is asked about before the results show again.
      onward: () => firstUnanswered(check) || 'results',
      render: () => (
        <>
          <NameRows
            label="Who reports to you"
            rows={people.map((p) => ({ id: p.id, title: p.name, sub: p.role }))}
            onRemove={remove}
          />
          {people.length < PEOPLE_MAX && (
            <div className="tpc-add">
              <AddButton onClick={() => setAdding(true)}>Add a person</AddButton>
            </div>
          )}
        </>
      ),
    },
    ...ratings.map((s, j) => ({
      key: s.key,
      name: s.person.name,
      label: countLine(s.n, s.of),
      question: question(s.kind, s.person),
      nudges: [nudge(s.kind)],
      percent: percentAt(j + 1, people.length),
      // One answer moves straight on (rule 21): no Next, and nothing to skip.
      oneTap: true,
      required: true,
      render: (tool) => (
        <Choice
          form="rows"
          tick
          ariaLabel={question(s.kind, s.person)}
          options={options(s.kind)}
          value={s.person[s.kind]}
          onChange={(value) => onCheck((c) => setRating(c, s.person.id, s.kind, value))}
          onChoose={() => tool.next()}
        />
      ),
    })),
    {
      key: 'results',
      name: 'Your team',
      title: 'Your team',
      eye,
      noProgress: true,
      className: 'tpc-results',
      footAside: pdf,
      render: (tool) => (
        <Results check={check} tool={tool} onResults={onResults} onEditList={() => tool.go(0, { fromSummary: true })} />
      ),
    },
  ];

  return (
    <>
      <GuidedTool
        calm
        longName
        name={TOOL_NAME}
        steps={steps}
        progress="percent"
        finishLabel="Add a to-do"
        skipLabel="Finish later"
        skipMoves={false}
        onSkip={onClose}
        draftKey={draftKey}
        initialStep={initialStep}
        onClose={onClose}
        // The results' coral button adds a to-do; it never ends the tool.
        onFinish={() => { setTodoOpen(true); return false; }}
      />
      <AddPersonPanel
        open={adding}
        onClose={() => setAdding(false)}
        onAdd={({ name, role }) => {
          onCheck((c) => addPerson(c, { id: newId(), name, role }));
          setAdding(false);
          toast.show('Added');
        }}
      />
      <ToolTodoPanel
        open={todoOpen}
        onClose={() => setTodoOpen(false)}
        source={TODO_SOURCE}
        sourceId={sourceId}
      />
    </>
  );
}
