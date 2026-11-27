import { Choice, GuidedSummary, GuidedTool, MultiChoice, TextBox, dayLabel } from '../components/design';
import DecisionFlow from './toolFocus/DecisionFlow';
import { BoxAndWhen, ListAnswer, PairRows } from './toolFocus/Draft6Parts';
import useRoleWords from '../lib/useRoleWords';
import { filled } from '../lib/draft6Tools/shared';
import * as MP from '../lib/draft6Tools/meetingPlanner';

// The Meeting planner (Polish 1, Stage D item 1): Draft 6's screens, word for
// word, one question per screen in focus mode (GuidedTool), at /plan-meeting.
// [board] is in the person's own words for their role and country
// (useRoleWords: "board", "board or owners", "owners or front office").
// Politics in the room adds "Who's with you, and who'll push back?" and
// "What won't you give up?"; a meeting with the [board] adds what they'll
// ask and what they need to hear early. It opens every plan the older page
// saved and keeps all of it (src/lib/draft6Tools/meetingPlanner.js). Every
// question can be skipped but the last, "What will you do before the
// meeting, and when?". The summary's button saves it and opens its summary
// page, with the PDF.

export default function PlanMeeting() {
  return (
    <DecisionFlow model={MP} draftName="meeting" closeTo="/interpersonal">
      {(flow) => <MeetingTool {...flow} />}
    </DecisionFlow>
  );
}

const NOT_YET = 'Not answered yet.';

function MeetingTool({ answers: a, onAnswers, draftKey, initialStep, onClose, onFinish }) {
  const { words } = useRoleWords();
  const set = (patch) => onAnswers((s) => ({ ...s, ...patch }));
  const box = (key) => <TextBox lines="many" ariaLabel={MP.QUESTIONS[key]} value={a[key]} onChange={(v) => set({ [key]: v })} />;

  const steps = [
    {
      key: 'kind',
      name: 'Type of meeting',
      question: MP.QUESTIONS.kind,
      // One tap moves on (rule 21).
      oneTap: true,
      render: (tool) => (
        <Choice
          form="rows"
          tick
          ariaLabel={MP.QUESTIONS.kind}
          options={MP.kinds(words)}
          value={a.kind}
          onChange={(kind) => set({ kind })}
          onChoose={() => tool.next()}
        />
      ),
    },
    { key: 'agreed', name: 'What’s been agreed', question: MP.QUESTIONS.agreed, render: () => box('agreed') },
    {
      key: 'room',
      name: 'Who’s in the room',
      question: MP.QUESTIONS.room,
      render: () => (
        <PairRows
          rows={a.people}
          onRows={(people) => set({ people })}
          fields={[{ key: 'name', label: 'Name' }, { key: 'wants', label: 'What they want' }]}
          itemName="person"
        />
      ),
    },
    ...(a.kind === 'politics' ? [
      {
        key: 'sides',
        name: 'Who’s with you',
        question: MP.QUESTIONS.sides,
        render: () => (
          <div className="d6-when">
            <ListAnswer label="With you" list={a.allies} onList={(allies) => set({ allies })} itemLabel={(n) => `With you ${n}`} />
            <ListAnswer label="Will push back" list={a.pushback} onList={(pushback) => set({ pushback })} itemLabel={(n) => `Will push back ${n}`} />
          </div>
        ),
      },
      { key: 'wontGive', name: 'What you won’t give up', question: MP.QUESTIONS.wontGive, render: () => box('wontGive') },
    ] : []),
    ...(a.kind === 'board' ? [
      { key: 'ask', name: 'What they’ll ask', question: MP.QUESTIONS.ask, render: () => box('ask') },
      {
        key: 'early',
        name: 'What they need early',
        question: MP.QUESTIONS.early,
        render: () => (
          <div className="d6-when">
            {!a.earlyNothing && box('early')}
            <MultiChoice
              ariaLabel={MP.NOTHING}
              options={[{ value: 'nothing', label: MP.NOTHING }]}
              values={a.earlyNothing ? ['nothing'] : []}
              onChange={(v) => set({ earlyNothing: v.includes('nothing') })}
            />
          </div>
        ),
      },
    ] : []),
    { key: 'decision', name: 'The decision', question: MP.QUESTIONS.decision, render: () => box('decision') },
    { key: 'opening', name: 'How you’ll open', question: MP.QUESTIONS.opening, render: () => box('opening') },
    {
      key: 'before',
      name: 'Before the meeting',
      question: MP.QUESTIONS.before,
      // The commit question: the one that can't be skipped (question rule 34).
      required: true,
      check: () => MP.beforeProblem(a),
      render: () => (
        <BoxAndWhen
          question={MP.QUESTIONS.before}
          text={a.before.text}
          onText={(t) => set({ before: { ...a.before, text: t } })}
          date={a.before.date}
          onDate={(date) => set({ before: { ...a.before, date } })}
        />
      ),
    },
    {
      key: 'sum',
      name: 'Your meeting plan',
      title: 'Your meeting plan',
      noProgress: true,
      wide: true,
      nextLabel: 'Save my plan',
      render: (tool) => <GuidedSummary stacked rows={summaryRows(a)} onChange={(key, opts) => tool.go(tool.steps.findIndex((s) => s.key === key), opts)} />,
    },
  ];

  return (
    <GuidedTool
      name={MP.TOOL_NAME}
      steps={steps}
      draftKey={draftKey}
      initialStep={initialStep}
      onClose={onClose}
      onFinish={onFinish}
      finishLabel="Save my plan"
    />
  );
}

// The summary (Draft 6): the outcome, the room, your opening and the decision,
// and what you'll do before it. The PDF is on the saved plan's page.
function summaryRows(a) {
  const people = MP.peopleIn(a);
  const rows = [
    { key: 'agreed', step: 'agreed', label: 'What’s been agreed', lines: [{ text: a.agreed.trim() || NOT_YET }] },
    {
      key: 'room',
      step: 'room',
      label: 'Who’s in the room',
      lines: people.length ? people.map((p) => ({ text: `${p.name || ''}`.trim() || 'Someone', sub: `${p.wants || ''}`.trim() || undefined })) : [{ text: NOT_YET }],
    },
  ];
  if (a.kind === 'politics') {
    const allies = filled(a.allies).map((r) => r.text.trim());
    const pushback = filled(a.pushback).map((r) => r.text.trim());
    rows.push({
      key: 'sides',
      step: 'sides',
      label: 'Who’s with you',
      lines: [
        { text: allies.length ? allies.join(', ') : NOT_YET, sub: pushback.length ? `Will push back: ${pushback.join(', ')}` : undefined },
      ],
    });
    rows.push({ key: 'wontGive', step: 'wontGive', label: 'What you won’t give up', lines: [{ text: a.wontGive.trim() || NOT_YET }] });
  }
  if (a.kind === 'board') {
    rows.push({ key: 'ask', step: 'ask', label: 'What they’ll ask', lines: [{ text: a.ask.trim() || NOT_YET }] });
    rows.push({ key: 'early', step: 'early', label: 'What they need early', lines: [{ text: a.earlyNothing ? MP.NOTHING : a.early.trim() || NOT_YET }] });
  }
  rows.push(
    { key: 'opening', step: 'opening', label: 'How you’ll open', lines: [{ text: a.opening.trim() || NOT_YET }] },
    { key: 'decision', step: 'decision', label: 'The decision you need', lines: [{ text: a.decision.trim() || NOT_YET }] },
    {
      key: 'before',
      step: 'before',
      label: 'Before the meeting',
      lines: [{ text: a.before.text.trim() || NOT_YET, sub: a.before.date ? dayLabel(a.before.date) : undefined }],
    },
  );
  return rows;
}
