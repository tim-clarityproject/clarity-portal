import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../../components/design';
import { rowsOf } from '../../../lib/coach/store';
import { MOMENTS, SAY_INTRO, SAY_LABEL, fill } from '../../../lib/agreements/talkingPoints';
import { TextLink, useCoachPortal } from '../parts';
import { Sec } from './builderParts';
import './builder.css';

// What to say (Phase 6b run 3, Group B; M28 s-say; brief item 41): /coach/what-to-say. Every hard moment's talking
// points in one place, in the coach's own words once edited in Settings, Agreements (065's talking_points), M28's
// until then. For the coach to say, never sent. The same points show on the Needs you item for each moment.

export default function WhatToSay() {
  const navigate = useNavigate();
  const { state } = useCoachPortal();
  const rows = rowsOf(state, 'talking_points');
  return (
    <div className="cc-page">
      <div className="cc-col ab-page">
        <PageHeader title="What to say" />
        <p className="ab-say ab-start-say">{SAY_INTRO}</p>
        {MOMENTS.map((m) => {
          const p = fill(m, {}, rows);
          return (
            <section key={m}>
              <Sec id={`ab-say-${m}`}>{p.title}</Sec>
              <div className="ab-talk">
                <p className="ab-cap">{SAY_LABEL}</p>
                {p.lines.map((l) => <p key={l} className="ab-talk-line">{l}</p>)}
                {p.tip && <p className="ab-talk-tip">{p.tip}</p>}
              </div>
            </section>
          );
        })}
        <TextLink onClick={() => navigate('/coach/settings/agreements')}>Edit them in Settings</TextLink>
      </div>
    </div>
  );
}
