import { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import DesignHeader from '../../components/DesignHeader';
import { Button, Card, MoreLink, PageOpening, Row, useToast } from '../../components/design';
import { B2_LINES } from '../../content/pageLines/client';
import { activeAreas, areaName, formatCheckinDate, newestCheckin } from '../../lib/wheelOfLife';
import { readInProgress } from '../../lib/wheelOfLifeApi';
import useWheelData from './useWheelData';
import useArrivalToast from './useArrivalToast';
import WheelLoadState from './WheelLoadState';
import '../../styles/wheelOfLife.css';

// /life-balance-review - the Start screen of the approved mock-up
// (wheel-of-life.html R.start), with real data. Opening it seeds the ten
// standard areas on a first visit (loadAreas).
export default function WheelStart() {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const toast = useToast();
  useArrivalToast(toast.show);
  const data = useWheelData();

  if (data.loading || data.error) {
    return <WheelLoadState loading={data.loading} error={data.error} onRetry={data.reload} />;
  }

  const areas = activeAreas(data.areas.all);
  const count = data.checkins.length;
  const newest = newestCheckin(data.checkins);
  const inProgress = readInProgress(user?.id);
  const here = '/life-balance-review';

  return (
    <div className="ui-root">
      <DesignHeader />
      {/* Polish 1 (rules 1 to 16): the page opening with its one main button, then cards of
          hairline rows. No Nekst on the step numbers, the areas' label or their targets. */}
      <main className="plan-page wol-page wol-page--open wol-enter">
        <PageOpening
          title="Life balance review"
          line={B2_LINES.lifeBalance}
          action={(
            <Button variant="primary" onClick={() => navigate('/life-balance-review/check-in')}>
              {inProgress ? 'Continue check-in' : 'Start check-in'}
            </Button>
          )}
        />

        <div className="wol-cards">
          <Card label="Your check-ins" link={count > 0 ? { children: 'See your wheel', onClick: () => navigate('/life-balance-review/results') } : undefined}>
            <Row name="Takes" value="~3 minutes" />
            <Row name="Last check-in" value={newest ? formatCheckinDate(newest.date) : 'None yet'} />
            {/* Never a bare 0 (rule 16): with none yet, the row above already says so. */}
            {count > 0 && <Row name="Check-ins so far" value={String(count)} />}
          </Card>

          <Card label="How it works">
            <ol className="wol-how">
              <li><span className="wol-how-n">1</span><span>Rate each area from 0, not at all satisfied, to 10, completely satisfied.</span></li>
              <li><span className="wol-how-n">2</span><span>Go with your first answer. Rate how it is right now, not how you think it should be.</span></li>
              <li><span className="wol-how-n">3</span><span>Your last score shows as a small dot under the scale, so you can see what has moved.</span></li>
            </ol>
          </Card>

          <Card
            label={`Your ${areas.length} ${areas.length === 1 ? 'area' : 'areas'}`}
            link={{ children: 'Edit your areas', onClick: () => navigate('/life-balance-review/areas', { state: { from: here } }) }}
          >
            {areas.map((a) => (
              <Row key={a.key} name={areaName(a)} value={a.target != null ? `Target ${a.target}` : null} />
            ))}
          </Card>
        </div>

        {count > 0 ? (
          <div className="wol-foot-links">
            <MoreLink onClick={() => navigate('/life-balance-review/targets', { state: { from: here } })}>Set targets</MoreLink>
          </div>
        ) : null}
      </main>
    </div>
  );
}
