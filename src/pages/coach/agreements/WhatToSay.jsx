import { useNavigate } from 'react-router-dom';
import { Card, MoreLink, PageOpening, Row } from '../../../components/design/Blocks';
import { AGREEMENT_LINES } from '../../../content/pageLines/coach';
import { rowsOf } from '../../../lib/coach/store';
import { MOMENTS, fill } from '../../../lib/agreements/talkingPoints';
import { useCoachPortal } from '../parts';
import './agreementPage.css';

// What to say (Phase 6b run 3, Group B; M28 version 4's s-say; brief item 41; Polish 1, Stage C, C4: M28 v6 draws
// none, so it is the page opening and one card a moment): /coach/what-to-say. Every hard moment's talking points in one
// place, in the coach's own words once edited in Settings, Agreements (065's talking_points), M28's until then. For the
// coach to say, never sent. The same points show on the Needs you item for each moment.

export default function WhatToSay() {
  const navigate = useNavigate();
  const { state } = useCoachPortal();
  const rows = rowsOf(state, 'talking_points');
  return (
    <div className="cc-page">
      <div className="cc-col ap-page">
        <PageOpening title="What to say" line={AGREEMENT_LINES.whatToSay} />
        {MOMENTS.map((m) => {
          const p = fill(m, {}, rows);
          if (!p) return null;
          return (
            <Card key={m} label={p.title} aria-label={p.title}>
              {p.lines.map((l) => <Row key={l} name={l} />)}
              {p.tip && <p className="ap-tip">{p.tip}</p>}
            </Card>
          );
        })}
        <MoreLink onClick={() => navigate('/coach/settings/agreements')}>Edit them in Settings</MoreLink>
      </div>
    </div>
  );
}
