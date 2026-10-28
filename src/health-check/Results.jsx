import { useMemo } from 'react';
import Chart from './Chart';
import { Dropdown, InfoButton, useTipTarget } from './parts';
import { PROGS, RES, SORTS, countLine, howLines, resultRows, sortRows, stateWords } from './words';
import { cleanItems } from '../pages/alignment/alignmentFlow.js';

// The one-pager (mock-up M7b version 4): the objective, the Critical Success
// Factors, the chart, the next step and the project list. Shared by the
// person's own results and the read-only example report.

function ProjectNumber({ row }) {
  const { isOpen: _open, ...t } = useTipTarget([{ label: `Project ${row.n}` }, { bold: row.text }]);
  return <span className={`pn ${row.q}`} aria-hidden="true" {...t}>{row.n}</span>;
}

function ProjectRow({ row, onOpen }) {
  const imp = row.rated ? row.pct : 0;
  return (
    <button type="button" className="pr" onClick={onOpen}>
      <ProjectNumber row={row} />
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

/**
 * @param {Object} props
 * @param {Object} props.draft the answers
 * @param {boolean} [props.theirs] the example report ("their", read only)
 */
export default function Results({ draft, theirs = false, phone, sort, onSort, coach, onChange, onEditProject, onTalk, onExampleEdit }) {
  const rows = useMemo(() => resultRows(draft), [draft]);
  const factors = cleanItems(draft.csfs);
  const nf = factors.length;
  const top = rows[0];
  const srt = SORTS.find((s) => s[0] === sort) || SORTS[0];
  const listed = sortRows(rows, sort);
  const anyPlotted = rows.some((r) => r.progress != null);
  return (
    <>
      <div className="obj1 rv" style={{ '--i': 2 }}>
        <div className="oh"><small>Objective</small>{!theirs && <button type="button" className="chg" onClick={() => onChange('objective')}>Change</button>}</div>
        <p>{draft.objective}</p>
      </div>
      <div className="sec" style={{ marginTop: 32, paddingTop: 24, borderTop: 0 }}>
        <div className="sech">
          <div><h3>Critical Success Factors (CSFs)</h3></div>
          {!theirs && <button type="button" className="chg" onClick={() => onChange('csf')}>Change</button>}
        </div>
        <div className="csfs">
          {factors.map((f, i) => <div className="csf" key={f.id}><i>{i + 1}</i><span>{f.text}</span></div>)}
        </div>
      </div>
      <div className="sec">
        <div className="sech"><div><h3>Strategic importance against progress</h3><p>{countLine(rows, theirs)}</p></div></div>
        {anyPlotted
          ? <div className="chart"><Chart rows={rows} phone={phone} /></div>
          : <p className="chart-empty">The chart shows each project once its progress is rated.</p>}
      </div>
      {top && (
        <div className="sec">
          <div className="sech"><div><h3>Next step</h3></div></div>
          <p className="nxt">{theirs ? 'Their next step is to start with “' : 'Start with “'}{top.text}”.</p>
          {!theirs && <button type="button" className="text" onClick={onTalk}>Talk it through with {coach}</button>}
        </div>
      )}
      <div className="sec">
        <div className="sech">
          <div>
            <h3>{theirs ? 'Their projects' : 'Your projects'}</h3>
            <p>{srt[2]}<InfoButton lines={howLines(nf, theirs)} label="How it’s worked out" /></p>
            {!theirs && <p>Choose a project to change its answers.</p>}
          </div>
          {!theirs && <button type="button" className="chg" onClick={() => onChange('projects')}>Change</button>}
        </div>
        <div className="sortr">
          <span className="fl">Sort by</span>
          <Dropdown small label="Sort by" title="Sort by" value={sort} options={SORTS.map(([value, label]) => ({ value, label }))} onChange={onSort} />
        </div>
        <div className="ptab">
          <div className="pr h" aria-hidden="true"><span /><span>Project</span><span>Strategic importance</span><span>Progress</span><span>Resource required</span></div>
          {listed.map((row) => (
            <ProjectRow key={row.id} row={row} onOpen={() => (theirs ? onExampleEdit() : onEditProject(row.id))} />
          ))}
        </div>
      </div>
    </>
  );
}
