import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/design/Button';
import { CalendarPopover } from '../../components/design/Calendar';
import { Choice } from '../../components/design/Choice';
import { PillChoice } from '../../components/design/Controls';
import Dropdown from '../../components/design/Dropdown';
import GuidedTool from '../../components/design/GuidedTool';
import RowList from '../../components/design/RowList';
import { ErrorMessage } from '../../components/design/Status';
import { SentenceInfo } from '../../components/design/TermInfo';
import TextBox from '../../components/design/TextBox';
import TitleIcons, { PlayButton } from '../../components/design/TitleIcons';
import { useToast } from '../../components/design/toastContext';
import { formatDocDate } from '../../lib/dateFormatter';
import { projectDates } from '../../lib/projectDates';
import { m20WithCsfLevel } from '../../lib/scores/m20.js';
import {
  MAX_FACTORS, MAX_ITEM, MAX_OBJECTIVE, MAX_PROJECTS, blankRow, cleanItems, setProjectDates,
} from '../alignment/alignmentFlow';
import { at, firstGap, nextStep, percent, prevStep, stepKey } from '../../health-check/flow';
import { CON, CSF_LEVELS, PROG, RES, SUCCESS_FACTOR_INFO, csfLevel } from '../../health-check/words';
import HealthCheckResults, { popLines } from './HealthCheckResults';
import './healthCheck.css';

// The Strategic Alignment Health Check as one guided tool (mock-up M7b
// version 51, read in full with its notes; M7 shares these screens word for
// word): the objective, the Success Factors, how much each matters, the
// projects, then for each project its contribution to each Success Factor,
// its dates, its progress and the resource it needs, then the results. Used
// by the outside Health Check (src/health-check) and by the Health Check
// inside the portal: the page around it owns the answers and saves them;
// this owns the screens.
//
//   draft, onDraft(fn, immediate)  the answers (alignmentFlow.js's draft) and
//                         their setter: fn takes the latest draft and gives
//                         the next; immediate saves at once
//   reached               the results have been seen (or it is complete):
//                         from then on only what is missing is asked
//   initialStep           the flow step to open on (flow.js)
//   onStep(step)          the step now showing, for the page to save
//   eye                   the who-sees eye, on the first question and the results
//   onGuide               the play icon opens the Quick guide (leave out to hide it)
//   name, title           the bar's short name and the results' title
//   resultsTop            what replaces the bar on the results (the outside
//                         page's crosshair)
//   resultsMeta           the lines under the results' title (organisation, date)
//   asOf                  the Health Check's date, for the Timing question
//   resultsAfter          what follows Questions to start with (Keep your
//                         results outside; Versions inside)
//   onPdf                 the results' one coral button, "Download my PDF"
//   onClose, onBack       Close on every step; Back on the first
//   lead                  inside the portal (M7): a step before the objective,
//                         { key, question, nudges, eye, check, nextLabel,
//                         render }: "Let’s start from your last answers." or
//                         "Which team is this Health Check for?"
//   onResults             inside the portal the results are a page of their
//                         own in the portal frame (M7): reaching them (the
//                         last answer, "Save my edit", "Back to results")
//                         calls this instead of drawing them here
//   editOn                with onResults, the part of the results to edit as
//                         the tool opens: 'objective', 'csf', 'projects', or
//                         { project: id } (a project's row); the tool opens on
//                         the results, then that part with "Save my edit"
//
// One-answer questions move straight on after 150ms and have no bottom bar
// (rule 21); the last Resource goes straight to the results. A button is
// never greyed out: a calm line says what is needed. Each section of the
// results has its own Edit, and "Save my edit" goes straight back with
// "Saved"; a project's row opens that project's own questions.

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const NEEDS = {
  objective: 'Type your objective to carry on.',
  csf: 'Add at least one Success Factor to carry on.',
  projects: 'Add at least one project to carry on.',
};

// Keeps at most `max` characters (as the database counts them) without
// splitting an emoji or an accented letter in two.
const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('en', { granularity: 'grapheme' }) : null;
export function clip(v, max) {
  if (Array.from(v).length <= max) return v;
  const parts = segmenter ? Array.from(segmenter.segment(v), (x) => x.segment) : Array.from(v);
  let out = '';
  for (const g of parts) { if (Array.from(out + g).length > max) break; out += g; }
  return out;
}

/** The months offered for Started and Due to finish. */
function monthOptions(kind, current) {
  const y = new Date().getFullYear();
  const out = [{ value: '', label: 'Not sure' }];
  const add = (yy, mm) => out.push({ value: `${yy}-${String(mm).padStart(2, '0')}`, label: `${MON[mm - 1]} ${yy}` });
  if (kind === 's') {
    for (let yy = y + 1; yy >= y - 6; yy -= 1) for (let mm = 12; mm >= 1; mm -= 1) add(yy, mm);
  } else {
    out.push({ value: 'open', label: 'Open-ended, with no agreed finish date' });
    for (let yy = y - 1; yy <= y + 4; yy += 1) for (let mm = 1; mm <= 12; mm += 1) add(yy, mm);
  }
  if (current && !out.some((o) => o.value === current)) {
    const [yy, mm] = current.split('-').map(Number);
    out.splice(kind === 'f' ? 2 : 1, 0, { value: current, label: `${MON[mm - 1]} ${yy}` });
  }
  return out;
}

/**
 * The list after RowList changed its rows: the rows keep their ids (the
 * ratings are kept by id), a row taken out is kept so Undo puts the same one
 * back, and a new box is a new row.
 */
function rowsChanged(list, texts, change, bin) {
  const clean = (t) => clip(t, MAX_ITEM);
  if (change?.removed != null) {
    bin.current = list[change.removed] || null;
    const rest = list.filter((_, j) => j !== change.removed);
    return rest.length ? rest : [blankRow()];
  }
  if (change?.restored != null) {
    const back = bin.current || blankRow();
    bin.current = null;
    const others = texts.filter((_, j) => j !== change.restored);
    const kept = others.map((t, j) => ({ ...(list[j] || blankRow()), text: clean(t) }));
    return [...kept.slice(0, change.restored), { ...back, text: clean(texts[change.restored] ?? back.text) }, ...kept.slice(change.restored)];
  }
  return texts.map((t, j) => ({ ...(list[j] || blankRow()), text: clean(t) }));
}

/** Tells the page which step is showing, once it is. */
function Mark({ step, stepId, onStep }) {
  const ref = useRef(onStep);
  ref.current = onStep;
  useEffect(() => { ref.current?.(step); /* only when the step changes */ }, [stepId]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function WhenStep({ project, onDraft }) {
  const [msg, setMsg] = useState({});
  const [picking, setPicking] = useState(false);
  const linkRef = useRef(null);
  const dates = projectDates(project);
  const set = (kind, value) => {
    let ok = true;
    onDraft((d) => {
      const p = cleanItems(d.projects).find((x) => x.id === project.id);
      if (!p) return d;
      const cur = projectDates(p);
      const input = { ...cur };
      if (kind === 's') { input.started = value; if (!value || !cur.startedOn?.startsWith(value)) delete input.startedOn; }
      if (kind === 'f') { input.due = value; if (!value || value === 'open' || !cur.dueOn?.startsWith(value)) delete input.dueOn; }
      if (kind === 'fOn') { if (value) input.dueOn = value; else delete input.dueOn; }
      if (kind === 'sOn') { if (value) input.startedOn = value; else delete input.startedOn; }
      const res = setProjectDates(d, p.id, input);
      if (!res.ok) {
        ok = false;
        setMsg({ [res.field === 'startedOn' || res.field === 'started' ? 's' : 'f']: res.message });
        return d;
      }
      setMsg({});
      return res.draft;
    }, true);
    return ok;
  };
  const month = dates.due && dates.due !== 'open' ? dates.due : null;
  const lastDay = month ? new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate() : 0;
  return (
    <>
      <div className="hc-dates">
        <div>
          <Dropdown label="Started" value={dates.started || ''} options={monthOptions('s', dates.started)} onChange={(v) => set('s', v)} />
          {msg.s && <ErrorMessage>{msg.s}</ErrorMessage>}
          {dates.startedOn && (
            <div className="hc-exact">
              <span>{formatDocDate(dates.startedOn).slice(4)}</span>
              <Button variant="text" onClick={() => set('sOn', undefined)}>Remove the exact start date</Button>
            </div>
          )}
        </div>
        <div>
          <Dropdown label="Due to finish" value={dates.due || ''} options={monthOptions('f', dates.due)} onChange={(v) => set('f', v)} />
          {msg.f && <ErrorMessage>{msg.f}</ErrorMessage>}
        </div>
      </div>
      {/* As the mock-up: one link under the pair, once Due to finish is a month. */}
      {month && (
        <div className="hc-exact">
          {dates.dueOn && <span>{formatDocDate(dates.dueOn).slice(4)}</span>}
          <Button ref={linkRef} variant="text" aria-haspopup="dialog" onClick={() => setPicking(true)}>{dates.dueOn ? 'Edit the exact date' : 'Add an exact date'}</Button>
          {dates.dueOn && <Button variant="text" onClick={() => set('fOn', undefined)}>Remove the exact date</Button>}
          <CalendarPopover
            open={picking}
            onClose={() => setPicking(false)}
            anchorRef={linkRef}
            title="Exact finish date"
            value={dates.dueOn || `${month}-01`}
            min={`${month}-01`}
            max={`${month}-${String(lastDay).padStart(2, '0')}`}
            onChange={(v) => { if (set('fOn', v)) setPicking(false); }}
          />
        </div>
      )}
    </>
  );
}

// The results: with an answer missing (a project or a Success Factor added
// from the results) it goes to that question instead.
function ResultsStep({ draft, tool, meta, asOf, after, onDraft, onEditProject, onStep, onResults, editRef }) {
  const [sort, setSort] = useState('att');
  const gap = firstGap(draft);
  const gapKey = gap ? stepKey(gap, draft) : null;
  const open = (key) => tool.go(tool.steps.findIndex((s) => s.key === key), { fromSummary: true });
  // Once per mount and gap: React's development check runs an effect twice,
  // and a second run would leave an edit straight back for the results.
  const handled = useRef(undefined);
  useEffect(() => {
    if (handled.current === gapKey) return;
    handled.current = gapKey;
    const ask = editRef?.current;
    if (ask) {
      editRef.current = null;
      if (typeof ask === 'object' && ask.project) onEditProject(ask.project);
      else open(ask);
      return;
    }
    if (gapKey) {
      const to = tool.steps.findIndex((s) => s.key === gapKey);
      if (to >= 0) tool.go(to);
      return;
    }
    // The results are the page's own (inside the portal).
    onResults?.();
    // Only when what's missing changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gapKey]);
  if (gapKey || onResults || editRef?.current) return null;
  return (
    <>
      <Mark step={at('results')} stepId="results" onStep={onStep} />
      {meta?.filter(Boolean).length > 0 && <div className="hc-meta">{meta.filter(Boolean).map((m) => <span key={m}>{m}</span>)}</div>}
      <HealthCheckResults
        draft={draft}
        asOf={asOf}
        sort={sort}
        onSort={setSort}
        onLine={(line) => onDraft((d) => ({ ...d, importantLine: line }), true)}
        onEdit={open}
        onEditProject={onEditProject}
      />
      {after}
    </>
  );
}

export default function HealthCheckTool({
  draft,
  onDraft,
  reached = false,
  initialStep,
  onStep,
  eye = null,
  onGuide,
  name = 'Health Check',
  title = 'Strategic Alignment Health Check',
  resultsTop = null,
  resultsMeta = [],
  asOf,
  resultsAfter = null,
  onPdf,
  onClose,
  onBack,
  lead = null,
  onResults,
  editOn = null,
}) {
  const toast = useToast();
  // An edit asked for as the tool opened (inside the portal) is done once.
  const editRef = useRef(editOn || null);
  // The project whose questions were opened from its row on the results.
  const [editing, setEditing] = useState(null);
  const toolRef = useRef(null);
  const bins = { csfs: useRef(null), projects: useRef(null) };
  const factors = cleanItems(draft.csfs);
  const projects = cleanItems(draft.projects);
  const [openOn] = useState(() => (editOn ? 'results' : initialStep ? (initialStep.screen === 'lead' ? lead?.key : stepKey(initialStep, draft)) : undefined));

  const icons = onGuide ? <TitleIcons><PlayButton label="Quick guide" onClick={onGuide} />{eye}</TitleIcons> : eye;
  const keyOf = (step) => (step.screen === 'results' ? 'results' : stepKey(step, draft));
  const mark = (step) => <Mark step={step} stepId={keyOf(step)} onStep={onStep} />;

  // Where a project's question goes next: on through that project when its
  // row was opened from the results, to the next answer still missing once
  // the results have been seen, and otherwise simply the next question.
  const modeOf = (p) => (editing && p?.id === editing ? 'edit' : reached ? 'gaps' : 'full');
  const onwardFrom = (step, p) => () => {
    const mode = modeOf(p);
    if (mode === 'full') return null;
    return keyOf(nextStep({ ...step, mode }, draft, reached));
  };
  const backFrom = (step, p) => () => {
    if (modeOf(p) !== 'edit') return null;
    const to = prevStep({ ...step, mode: 'edit' }, draft);
    return to?.screen === 'results' ? 'results' : null;
  };
  // After a list changed from the results: the first answer now missing.
  const onwardToGap = () => {
    if (!reached) return null;
    const gap = firstGap(draft);
    return gap ? stepKey(gap, draft) : null;
  };

  const setList = (k) => (texts, change) => onDraft((d) => ({ ...d, [k]: rowsChanged(d[k], texts, change, bins[k]) }), !!change || texts.length !== draft[k].length);
  const rate = (p, patch) => onDraft((d) => {
    const r = d.ratings[p.id] || {};
    return { ...d, ratings: { ...d.ratings, [p.id]: { contrib: { ...(r.contrib || {}) }, progress: r.progress ?? null, resource: r.resource ?? null, ...patch(r) } } };
  }, true);

  const counter = (pi, fi) => (
    <span className="hc-count">
      <span>{`Project ${pi + 1} of ${projects.length}`}</span>
      {fi != null && <span>{`Success Factor ${fi + 1} of ${factors.length}`}</span>}
    </span>
  );

  const projectSteps = projects.flatMap((p, pi) => {
    const r = draft.ratings[p.id] || {};
    const named = `“${p.text}”`;
    const one = (screen, { fi = 0, body, name: what, ...extra }) => {
      const step = at(screen, { pi, fi });
      return {
        key: keyOf(step),
        name: `${p.text}, ${what}`,
        percent: percent(step, draft),
        onward: onwardFrom(step, p),
        back: backFrom(step, p),
        ...extra,
        render: (tool) => <>{mark(step)}{body(tool)}</>,
      };
    };
    const tap = (question, options, value, onPick) => (tool) => (
      <Choice form="rows" tick ariaLabel={question} options={options} value={value} onChange={onPick} onChoose={() => tool.next()} />
    );
    const contribQ = (f) => `How much does ${named} contribute to “${f.text}”?`;
    const progressQ = `How far along is ${named}?`;
    const resourceQ = `How much resource does ${named} need?`;
    return [
      ...factors.map((f, fi) => one('contrib', {
        fi,
        name: `contribution to ${f.text}`,
        label: counter(pi, fi),
        question: contribQ(f),
        nudges: ['Rate the level of impact.'],
        oneTap: true,
        required: true,
        body: tap(contribQ(f), CON.map(([label, hint], value) => ({ value, label, hint })), r.contrib?.[f.id], (v) => rate(p, (x) => ({ contrib: { ...(x.contrib || {}), [f.id]: v } }))),
      })),
      one('when', {
        name: 'dates',
        label: counter(pi),
        question: `When did ${named} start, and when is it due to finish?`,
        nudges: ['Choose a month for each.'],
        required: true,
        // "Back to results" beside Next, once the results have been seen.
        footAside: reached ? <Button variant="text" onClick={() => toolRef.current?.go(toolRef.current.steps.length - 1)}>Back to results</Button> : undefined,
        body: (tool) => { toolRef.current = tool; return <WhenStep project={p} onDraft={onDraft} />; },
      }),
      one('progress', {
        name: 'progress',
        label: counter(pi),
        question: progressQ,
        nudges: ['Choose the one that fits best.'],
        oneTap: true,
        required: true,
        body: tap(progressQ, PROG.slice(1).map(([label, hint], i) => ({ value: i + 1, label, hint })), r.progress, (v) => rate(p, () => ({ progress: v }))),
      }),
      one('resource', {
        name: 'resource required',
        label: counter(pi),
        question: resourceQ,
        nudges: ['Consider time, people, money and technology.'],
        oneTap: true,
        required: true,
        body: tap(resourceQ, RES.slice(1).map(([label, hint], i) => ({ value: i + 1, label, hint })), r.resource, (v) => rate(p, () => ({ resource: v }))),
      }),
    ];
  });

  const steps = [
    // Inside the portal: the new version's or the new team's first step (M7).
    ...(lead ? [{
      percent: 0,
      required: true,
      ...lead,
      render: (tool) => <>{mark(at('lead'))}{lead.render(tool)}</>,
    }] : []),
    {
      key: 'objective',
      name: 'Objective',
      question: 'What is your team trying to achieve?',
      nudges: ['Write it in one sentence.'],
      eye: icons,
      required: true,
      percent: percent(at('objective'), draft),
      check: () => (draft.objective.trim() ? null : NEEDS.objective),
      render: () => (
        <>
          {mark(at('objective'))}
          <TextBox
            ariaLabel="What is your team trying to achieve?"
            placeholder="e.g. Double recurring revenue by 2028"
            value={draft.objective}
            maxLength={MAX_OBJECTIVE}
            onChange={(v) => onDraft((d) => ({ ...d, objective: clip(v.replace(/\n/g, ' '), MAX_OBJECTIVE) }), false)}
          />
        </>
      ),
    },
    {
      key: 'csf',
      name: 'Success Factors',
      question: 'How will you achieve your objective?',
      nudges: ['List the 3 to 6 medium to long-term approaches that are critical for achieving your objective.'],
      required: true,
      percent: percent(at('csf'), draft),
      check: () => (factors.length ? null : NEEDS.csf),
      // Edited from the results: how much each matters comes next, then "Save my edit".
      thenEdit: 'weight',
      editNext: 'Next',
      render: () => (
        <>
          {mark(at('csf'))}
          <p className="hc-flab"><SentenceInfo lines={popLines(SUCCESS_FACTOR_INFO)} label="What is a Success Factor?">Success Factors</SentenceInfo></p>
          <RowList
            rows={draft.csfs.map((x) => x.text)}
            onChange={setList('csfs')}
            max={MAX_FACTORS}
            maxLength={MAX_ITEM}
            itemLabel={(n) => `Success Factor ${n}`}
            removeLabel={(n) => `Remove Success Factor ${n}`}
            placeholder="e.g. Win enterprise customers in the US"
            addLabel="Add a Success Factor"
            removeAlways
            undo
          />
        </>
      ),
    },
    {
      key: 'weight',
      name: 'How much each matters',
      question: 'How much does each Success Factor matter to your objective?',
      nudges: ['Choose Critical for the one or two that matter most.'],
      required: true,
      percent: percent(at('weight'), draft),
      check: () => (factors.length ? null : NEEDS.csf),
      back: () => 'csf',
      onward: onwardToGap,
      render: () => (
        <>
          {mark(at('weight'))}
          <div className="hc-weights">
            {factors.map((f) => (
              <div className="hc-weight" key={f.id}>
                <p>{f.text}</p>
                <PillChoice
                  ariaLabel={f.text}
                  options={CSF_LEVELS.map((l) => ({ value: l.level, label: l.name }))}
                  value={csfLevel(f)}
                  onChange={(level) => onDraft((d) => m20WithCsfLevel(d, f.id, level), true)}
                />
              </div>
            ))}
          </div>
        </>
      ),
    },
    {
      key: 'projects',
      name: 'Projects',
      question: 'What is your team working on?',
      nudges: ['List every project or piece of work, now or planned.'],
      nudgeInfo: { label: 'What counts as a project', text: [{ title: 'Projects' }, 'Include anything that takes your team’s time, money or people.'] },
      required: true,
      percent: percent(at('projects'), draft),
      check: () => (projects.length ? null : NEEDS.projects),
      onward: onwardToGap,
      render: () => (
        <>
          {mark(at('projects'))}
          <RowList
            rows={draft.projects.map((x) => x.text)}
            onChange={setList('projects')}
            max={MAX_PROJECTS}
            maxLength={MAX_ITEM}
            itemLabel={(n) => `Project ${n}`}
            placeholder="e.g. New CRM roll-out"
            addLabel="Add a project"
            removeAlways
            undo
          />
        </>
      ),
    },
    ...projectSteps,
    {
      key: 'results',
      name: 'Results',
      title,
      eye: icons,
      noProgress: true,
      top: resultsTop,
      className: 'hc-results',
      nextLabel: 'Download my PDF',
      render: (tool) => (
        <ResultsStep
          draft={draft}
          tool={tool}
          meta={resultsMeta}
          asOf={asOf}
          after={resultsAfter}
          onResults={onResults}
          editRef={editRef}
          onDraft={onDraft}
          onStep={(s) => { setEditing(null); onStep?.(s); }}
          onEditProject={(id) => {
            const pi = projects.findIndex((p) => p.id === id);
            if (pi < 0) return;
            setEditing(id);
            const key = stepKey(at(factors.length ? 'contrib' : 'when', { pi, fi: 0 }), draft);
            tool.go(tool.steps.findIndex((s) => s.key === key));
          }}
        />
      ),
    },
  ];

  return (
    <GuidedTool
      calm
      name={name}
      steps={steps}
      progress="percent"
      finishLabel="Download my PDF"
      initialStep={openOn}
      onClose={onClose}
      onBack={onBack}
      onEdited={() => toast.show('Saved')}
      // The results' coral button downloads the PDF; it never ends the tool.
      onFinish={() => { onPdf?.(); return false; }}
    />
  );
}
