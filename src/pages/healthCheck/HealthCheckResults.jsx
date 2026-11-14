import { useMemo, useState } from 'react';
import { Button } from '../../components/design/Button';
import Dropdown from '../../components/design/Dropdown';
import { ResultsHeadline, ResultsSection, StartQuestions } from '../../components/design/Results';
import StepBars from '../../components/design/StepBars';
import { SentenceInfo } from '../../components/design/TermInfo';
import useIsPhone from '../../components/design/useIsPhone';
import HealthCheckChart from './HealthCheckChart';
import {
  CHART_TITLE, LINE_OPTIONS, PROGS, RES, SORTS, chartInfo, csfLevel, csfLevelName, headlineLine, importanceLines, resultsModel, sortRows, stateWords,
} from '../../health-check/words';
import './healthCheck.css';

// The Health Check's one-pager (mock-up M7b version 51; M7 shares it word for
// word), in the order of 13 Nov (rule 29ar): the headline as one sentence,
// the chart with its ⓘ and the line for important, Projects (Sort by, then
// the list), the Objective, the Success Factors with their levels, and
// Questions to start with, always last. Shared by the outside Health Check's
// results, the read-only example report and the Health Check inside the
// portal; whatever follows the questions (Keep your results, Versions) is the
// page's own.
// Every figure comes from src/lib/scores/m20.js (resultsModel in words.js).

/** A pop-up's lines from the words file's ({ bold } is the pop-up's own name). */
export const popLines = (lines) => lines.map((l) => (l.bold ? { title: l.bold } : l.line ? l.line : l));

const NOT_RATED = 'Not rated';

// One project: its number and state, its name, then strategic importance,
// progress and resource required. On a laptop they are three columns under
// their headings; on a phone the headings go and each is a labelled line
// under the name (Tim, 14 Nov, 09:47: a table with more than two data
// columns becomes labelled lines on a phone). Never a coral bar: the row can
// be tapped.
function ProjectRow({ row, onOpen, theirs }) {
  const progress = PROGS[row.progress] || NOT_RATED;
  const resource = RES[row.resource]?.[0] || NOT_RATED;
  const said = `Project ${row.n}, ${row.text}. ${stateWords(row)}. Strategic importance ${row.rated ? `${row.pct}%` : 'not rated'}. Progress “${progress}”. Resource required “${resource}”.`;
  return (
    <button type="button" className="hc-prow" onClick={onOpen} aria-label={`${theirs ? '' : 'Edit '}${said}`}>
      <span className={`hc-pn${row.q ? ` hc-pn--${row.q}` : ''}`} aria-hidden="true">{row.n}</span>
      <span className="hc-pt" aria-hidden="true">
        <b>{row.text}</b>
        <small>
          <span className={`hc-q hc-q--${row.q || 'no'}`}>{stateWords(row)}</span>
          {row.dates.map((d) => <span key={d} className="hc-pdate">{d}</span>)}
        </small>
      </span>
      <span className="hc-pcell" aria-hidden="true">
        <span className="hc-ml">Strategic importance</span>
        <span className="hc-imb">
          <span className="hc-imb-track"><i style={{ width: `${row.rated ? row.pct : 0}%` }} /></span>
          <span className="hc-imb-figure">{row.rated ? `${row.pct}%` : NOT_RATED}</span>
        </span>
      </span>
      <span className="hc-pcell" aria-hidden="true">
        <span className="hc-ml">Progress</span>
        <StepBars value={row.progress} tone={row.progress >= 4 ? 'good' : ''} word={progress} under strong />
      </span>
      <span className="hc-pcell" aria-hidden="true">
        <span className="hc-ml">Resource required</span>
        <StepBars value={row.resource} word={resource} under strong />
      </span>
    </button>
  );
}

/**
 * The project list, with its column headings on a laptop.
 * @param {Object[]} props.rows resultRows, in the order to show
 */
export function ProjectList({ rows, theirs = false, onOpen }) {
  return (
    <div className="hc-ptab">
      <div className="hc-prow hc-prow--head">
        <span />
        <span>Project</span>
        <span><SentenceInfo lines={popLines(importanceLines())} label="What strategic importance means">Strategic importance</SentenceInfo></span>
        <span>Progress</span>
        <span>Resource required</span>
      </div>
      {rows.map((row) => <ProjectRow key={row.id} row={row} theirs={theirs} onOpen={() => onOpen(row.id)} />)}
    </div>
  );
}

/**
 * @param {Object} props
 * @param {Object} props.draft the answers
 * @param {string|Date} [props.asOf] the Health Check's date, for the Timing question
 * @param {boolean} [props.theirs] the example report ("their", read only: no Edit links, no line to set)
 * @param {string} props.sort, props.onSort the list's order (SORTS in words.js)
 * @param {(line: number) => void} [props.onLine] a new line for important
 * @param {(part: 'objective'|'csf'|'projects') => void} [props.onEdit] a section's own Edit
 * @param {(projectId: string) => void} [props.onEditProject] a project's row
 * @param {() => void} [props.onExampleEdit] a row of the example report was pressed
 * @param {Object} [props.was] where each project stood in an earlier version (HealthCheckChart's `was`)
 */
export default function HealthCheckResults({ draft, asOf, theirs = false, sort = 'att', onSort, onLine, onEdit, onEditProject, onExampleEdit, was = null }) {
  const phone = useIsPhone();
  const model = useMemo(() => resultsModel(draft, { asOf, theirs }), [draft, asOf, theirs]);
  const { rows, factors, line, headline, questions, gaps } = model;
  const [lit, setLit] = useState(null);
  const listed = sortRows(rows, sort);
  const anyPlotted = rows.some((r) => r.progress != null);
  const edit = (part, label) => (theirs ? null : <Button variant="text" aria-label={label} onClick={() => onEdit(part)}>Edit</Button>);
  return (
    <>
      <ResultsSection first>
        <ResultsHeadline>{headlineLine(headline, theirs)}</ResultsHeadline>
        {headline.important > 0 && headline.rest && <p className="hc-headline-rest">{headline.rest}</p>}
      </ResultsSection>
      <ResultsSection
        row
        className="hc-chart-section"
        title={<SentenceInfo lines={popLines(chartInfo(line))} label="How to read the chart">{CHART_TITLE}</SentenceInfo>}
      >
        {!theirs && (
          <div className="hc-ctl">
            <Dropdown label="Important means above" value={line} options={LINE_OPTIONS} onChange={onLine} />
          </div>
        )}
        {anyPlotted
          ? <HealthCheckChart rows={rows} line={line} phone={phone} lit={lit} was={was} />
          : <p className="hc-chart-empty">The chart shows each project once its progress is rated.</p>}
      </ResultsSection>
      <ResultsSection row title="Projects" action={edit('projects', 'Edit the list of projects')} className="hc-projects">
        <div className="hc-ctl">
          <Dropdown label="Sort by" value={sort} options={SORTS.map(([value, label]) => ({ value, label }))} onChange={onSort} />
        </div>
        <ProjectList rows={listed} theirs={theirs} onOpen={(id) => (theirs ? onExampleEdit?.() : onEditProject(id))} />
      </ResultsSection>
      <ResultsSection row title="Objective" action={edit('objective', 'Edit the objective')}>
        <p className="hc-objective">{draft.objective}</p>
      </ResultsSection>
      <ResultsSection row title="Success Factors" action={edit('csf', 'Edit the Success Factors')}>
        <div className="hc-factors">
          {factors.map((f, i) => (
            <div className="hc-factor" key={f.id}>
              <span className="hc-factor-n" aria-hidden="true">{i + 1}</span>
              <div>
                <span className="hc-factor-level">{csfLevelName(csfLevel(f))}</span>
                <p>{f.text}</p>
                {gaps.includes(f.id) && <p className="hc-factor-gap">No project strongly supports this yet.</p>}
              </div>
            </div>
          ))}
        </div>
      </ResultsSection>
      {/* Always the last part of the summary (Tim, 13 Nov, 18:11). With a mouse, pointing at a question about a project lights its dot. */}
      <StartQuestions
        row
        title="Questions to start with"
        questions={questions.map((q) => ({ key: q.kind, label: q.label, question: q.question, reason: q.reason, projectId: q.projectId }))}
        onPoint={(q) => setLit(q?.projectId || null)}
      />
    </>
  );
}
