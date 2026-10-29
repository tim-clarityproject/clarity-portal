import { useMemo, useState } from 'react';
import Chart from './Chart';
import { Dropdown, InfoButton } from './parts';
import {
  LINE_OPTIONS, ORDER_LINES, PROGS, RES, SORTS, csfLevel, csfLevelName, importanceLines, resultsModel, sortRows, stateWords,
} from './words';

// The one-pager (mock-up M7b version 46): the objective, At a glance (the
// headline and the questions to start with), the chart with the line for
// important, the Critical Success Factors with their levels, and the project
// list. Shared by the person's own results and the read-only example report.
// Every figure comes from src/lib/scores/m20.js (resultsModel in words.js).

function ProjectRow({ row, onOpen }) {
  const imp = row.rated ? row.pct : 0;
  return (
    <button type="button" className="pr" onClick={onOpen}>
      {/* No pop-up on the number: the name is beside it (Tim, 28 Oct, 14:45). */}
      <span className={`pn ${row.q}`} aria-hidden="true">{row.n}</span>
      <span className="pt">
        <b>{row.text}</b>
        <span className="pst">
          <span className={`q-${row.q || 'no'}`}>{stateWords(row)}</span>
          {row.dates.map((d) => <span key={d}>{d}</span>)}
        </span>
      </span>
      <span className="pm">
        <span className="ib"><span className="bar"><i style={{ width: `${imp}%` }} /></span>{row.rated ? `${row.pct}%` : 'Not rated'}</span>
        <span className="pw">{PROGS[row.progress] || 'Not rated'}</span>
        <span className="pw">{RES[row.resource]?.[0] || 'Not rated'}</span>
      </span>
    </button>
  );
}

/** One headline figure, then up to three questions, most urgent first (Tim, 28 Oct, 14:05 to 14:41). */
function AtAGlance({ headline, questions, onPoint }) {
  return (
    <div className="sec gls">
      <div className="sech"><div><h3>At a glance</h3></div></div>
      <div className="gl">
        <div className="gst">
          <b>{headline.big}</b>
          <p>{headline.line}</p>
          {headline.rest && <p className="sub">{headline.rest}</p>}
        </div>
        <div className="mvs">
          <span className="fl">Questions to start with</span>
          {questions.map((x, i) => (
            <div
              key={x.kind}
              className={`mv${i === 0 ? ' main' : ''}`}
              // With a mouse, pointing at a question about a project lights its dot.
              onPointerEnter={x.projectId ? (e) => { if (e.pointerType === 'mouse') onPoint(x.projectId); } : undefined}
              onPointerLeave={x.projectId ? () => onPoint(null) : undefined}
            >
              <div>
                <small>{x.label}</small>
                <p className={i === 0 ? 'nxt' : 'mvt'}>{x.question}</p>
                <p className="why">{x.reason}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * @param {Object} props
 * @param {Object} props.draft the answers
 * @param {string|Date} [props.asOf] the Health Check's date, for the Timing question
 * @param {boolean} [props.theirs] the example report ("their", read only)
 * @param {(line: number) => void} [props.onLine] a new line for important
 */
export default function Results({ draft, asOf, theirs = false, phone, sort, onSort, onLine, onChange, onEditProject, onExampleEdit }) {
  const model = useMemo(() => resultsModel(draft, { asOf, theirs }), [draft, asOf, theirs]);
  const { rows, factors, line, headline, questions, gaps } = model;
  const [lit, setLit] = useState(null);
  const srt = SORTS.find((s) => s[0] === sort) || SORTS[0];
  const listed = sortRows(rows, sort);
  const anyPlotted = rows.some((r) => r.progress != null);
  return (
    <>
      <div className="obj1 rv" style={{ '--i': 2 }}>
        <div className="oh"><small>Objective</small>{!theirs && <button type="button" className="chg" onClick={() => onChange('objective')}>Change</button>}</div>
        <p>{draft.objective}</p>
      </div>
      <AtAGlance headline={headline} questions={questions} onPoint={setLit} />
      <div className="sec">
        <div className="sech">
          <div>
            <h3>Strategic importance against progress</h3>
            <p>Each dot is a project.</p>
            <p>Bigger dots require more resource.</p>
            {theirs && <p>Important means above {line}%.</p>}
          </div>
        </div>
        {!theirs && (
          <div className="sortr">
            <span className="fl">Important means above</span>
            <Dropdown small label="Important means above" title="Important means above" value={line} options={LINE_OPTIONS} onChange={onLine} />
          </div>
        )}
        {anyPlotted
          ? <div className="chart"><Chart rows={rows} line={line} phone={phone} lit={lit} /></div>
          : <p className="chart-empty">The chart shows each project once its progress is rated.</p>}
      </div>
      <div className="sec">
        <div className="sech">
          {/* In capitals the abbreviation would read "CSFS", so headings never carry it. */}
          <div><h3>Critical Success Factors</h3></div>
          {!theirs && <button type="button" className="chg" onClick={() => onChange('csf')}>Change</button>}
        </div>
        <div className="csfs">
          {factors.map((f, i) => (
            <div className="csf" key={f.id}>
              <i>{i + 1}</i>
              <span>
                <small className="wl">{csfLevelName(csfLevel(f))}</small>
                {f.text}
                {gaps.includes(f.id) && <small className="gap">No project strongly supports this yet.</small>}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="sec">
        <div className="sech">
          <div>
            <h3>{theirs ? 'Their projects' : 'Your projects'}</h3>
            <p>{srt[2]}<InfoButton lines={ORDER_LINES} label="How it’s worked out" /></p>
            {!theirs && <p>Choose a project to edit its answers.</p>}
          </div>
          {!theirs && <button type="button" className="chg" onClick={() => onChange('projects')}>Change</button>}
        </div>
        <div className="sortr">
          <span className="fl">Sort by</span>
          <Dropdown small label="Sort by" title="Sort by" value={sort} options={SORTS.map(([value, label]) => ({ value, label }))} onChange={onSort} />
        </div>
        <div className="ptab">
          <div className="pr h">
            <span /><span>Project</span>
            <span>Strategic importance<InfoButton lines={importanceLines(theirs)} label="What strategic importance means" /></span>
            <span>Progress</span><span>Resource required</span>
          </div>
          {listed.map((row) => (
            <ProjectRow key={row.id} row={row} onOpen={() => (theirs ? onExampleEdit() : onEditProject(row.id))} />
          ))}
        </div>
      </div>
    </>
  );
}
