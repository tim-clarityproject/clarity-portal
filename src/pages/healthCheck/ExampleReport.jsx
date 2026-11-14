import { useState } from 'react';
import { EXAMPLE } from '../../health-check/example';
import HealthCheckResults from './HealthCheckResults';
import './healthCheck.css';

// The example report's own content (M7b "Example report"): Quillmark, an
// invented company, read only. The page around it gives the Back link, the
// title and the button that starts a Health Check.
export const EXAMPLE_META = [`${EXAMPLE.org}, leadership team`, EXAMPLE.date];

export default function ExampleReport({ onEdit }) {
  const [sort, setSort] = useState('att');
  return (
    <>
      <div className="hc-meta">{EXAMPLE_META.map((m) => <span key={m}>{m}</span>)}</div>
      <div className="hc-example-intro">
        <p>Quillmark is an invented software company, to show what you’ll get.</p>
        <p>It’s backed by private equity and is 2 years into a plan to double in size.</p>
        <p>Its leadership team rated 8 projects against 5 Success Factors.</p>
      </div>
      <HealthCheckResults draft={EXAMPLE.draft} asOf={EXAMPLE.asOf} theirs sort={sort} onSort={setSort} onExampleEdit={onEdit} />
    </>
  );
}
