import { useMemo } from 'react';
import Dropdown from '../../components/design/Dropdown';
import { ResultsHeadline, ResultsSection } from '../../components/design/Results';
import { SentenceInfo } from '../../components/design/TermInfo';
import useIsPhone from '../../components/design/useIsPhone';
import { resultRows } from '../../health-check/words';
import HealthCheckChart from './HealthCheckChart';
import './healthCheck.css';

// Compare two versions (mock-up M7 version 8.2): the earlier and the later
// version, chosen by their names only; one sentence on the change in
// important projects moving well, never a coloured figure; the chart of how
// projects moved (each dot where it is now, a dashed ring and a fine line
// from where it was; what the marks mean in the ⓘ) before how progress
// moved (rises first, in mint, then falls); then the projects added and no
// longer listed. No coral button: comparing is for looking and talking.
//
//   model:   compareVersions (src/lib/healthCheck/inside.js)
//   options: [{ value: version id, label: "October Health Check" }]
//   onPick:  (which: 'a' | 'b', id) => the page swaps them when needed
//   talk:    the quiet link at the end, or nothing

function chartLines(model) {
  return [
    { title: 'How projects moved' },
    { term: 'Each dot', meaning: `It’s a project, where it is on ${model.laterDate}.` },
    { term: 'Each dashed ring', meaning: `It shows where the project was on ${model.earlierDate}.` },
    { term: 'Bigger dots', meaning: 'They show projects that require more resource.' },
    { term: 'Important', meaning: `It means above ${model.line}%.` },
  ];
}

export default function HealthCheckCompare({ model, options, onPick, talk = null }) {
  const phone = useIsPhone();
  const rows = useMemo(() => resultRows(model.later.draft), [model.later]);
  const moved = [...model.up.map((m) => ({ ...m, up: true })), ...model.down];
  return (
    <>
      <div className="hc-dates hc-cmp-pick">
        <div><Dropdown label="Earlier version" value={model.earlier.id} options={options} onChange={(id) => onPick('a', id)} /></div>
        <div><Dropdown label="Later version" value={model.later.id} options={options} onChange={(id) => onPick('b', id)} /></div>
      </div>
      <ResultsSection first>
        <ResultsHeadline>{model.sentence}</ResultsHeadline>
        <p className="hc-headline-rest">{model.counts}</p>
      </ResultsSection>
      <ResultsSection row title={<SentenceInfo lines={chartLines(model)} label="How to read the chart">How projects moved</SentenceInfo>} className="hc-chart-section">
        <HealthCheckChart rows={rows} line={model.line} phone={phone} was={model.was} notes={model.notes} />
      </ResultsSection>
      <ResultsSection row title="How progress moved">
        {moved.map((m) => (
          <div key={m.id} className="hc-cmp-move">
            <span>{m.text}</span>
            <span className={m.up ? 'hc-cmp-up' : undefined}>{`${m.from} to ${m.to}`}</span>
          </div>
        ))}
        {!moved.length && <p className="hc-cmp-same">No project’s progress has moved.</p>}
        {model.sameLine && <p className="hc-cmp-same">{model.sameLine}</p>}
      </ResultsSection>
      <ResultsSection row title="Projects added and removed">
        <div className="hc-cmp-two">
          <div>
            <span className="hc-cmp-label">{`Added since ${model.earlierDate}`}</span>
            {model.added.length ? model.added.map((t) => <p key={t} className="hc-cmp-name">{t}</p>) : <p className="hc-cmp-name">No projects were added.</p>}
          </div>
          <div>
            <span className="hc-cmp-label">No longer listed</span>
            {model.gone.length ? model.gone.map((t) => <p key={t} className="hc-cmp-name">{t}</p>) : <p className="hc-cmp-name">Every project is still listed.</p>}
          </div>
        </div>
      </ResultsSection>
      {talk && <div className="hc-end">{talk}</div>}
    </>
  );
}
