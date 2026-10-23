import { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import DesignHeader from '../../components/DesignHeader';
import { PageHeader } from '../../components/design';
import pageText from '../../content/pageText';
import Toast from '../../components/ui/Toast';
import useToast from '../../hooks/useToast';
import { activeAreas, areaName, formatCheckinDate, newestCheckin } from '../../lib/wheelOfLife';
import { readInProgress } from '../../lib/wheelOfLifeApi';
import useWheelData from './useWheelData';
import useArrivalToast from './useArrivalToast';
import { PenIcon, TargetIcon } from './icons';
import WheelLoadState from './WheelLoadState';
import '../../styles/wheelOfLife.css';

// /wheel-of-life - the Start screen of the approved mock-up
// (wheel-of-life.html R.start), with real data. Opening it seeds the ten
// standard areas on a first visit (loadAreas).
export default function WheelStart() {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const { message, showToast } = useToast();
  useArrivalToast(showToast);
  const data = useWheelData();

  if (data.loading || data.error) {
    return <WheelLoadState loading={data.loading} error={data.error} onRetry={data.reload} toast={message} />;
  }

  const areas = activeAreas(data.areas.all);
  const count = data.checkins.length;
  const newest = newestCheckin(data.checkins);
  const inProgress = readInProgress(user?.id);
  const here = '/wheel-of-life';

  return (
    <div className="ui-root">
      <DesignHeader />
      <div className="plan-page wol-page wol-enter">
        <div className="wol-head">
          <PageHeader title="Wheel of Life" info={pageText.wheelOfLife} />
        </div>

        <div className="wol-facts wol-rv" style={{ '--i': 3 }}>
          <div><b>Takes</b><span>About 3 minutes</span></div>
          <div><b>Last check-in</b><span>{newest ? formatCheckinDate(newest.date) : 'None yet'}</span></div>
          <div><b>Check-ins so far</b><span>{count}</span></div>
        </div>

        <ol className="wol-how wol-rv" style={{ '--i': 4 }}>
          <li><b>01</b><span>Rate each area from 0, not at all satisfied, to 10, completely satisfied.</span></li>
          <li><b>02</b><span>Go with your first answer. Rate how it is right now, not how you think it should be.</span></li>
          <li><b>03</b><span>Your last score shows as a small dot under the scale, so you can see what has moved.</span></li>
        </ol>

        <span className="wol-lab wol-rv" style={{ '--i': 5 }}>{`Your ${areas.length} ${areas.length === 1 ? 'area' : 'areas'}`}</span>
        <div className="wol-areas wol-rv" style={{ '--i': 5 }}>
          {areas.map((a) => (
            <span key={a.key}>
              {areaName(a)}
              {a.target != null ? <b>{`Target ${a.target}`}</b> : null}
            </span>
          ))}
        </div>

        <div className="wol-qrow wol-rv" style={{ '--i': 5 }}>
          <button type="button" className="wol-qlink" onClick={() => navigate('/wheel-of-life/areas', { state: { from: here } })}>
            <PenIcon />Change your areas
          </button>
          {count > 0 ? (
            <button type="button" className="wol-qlink" onClick={() => navigate('/wheel-of-life/targets', { state: { from: here } })}>
              <TargetIcon />Set targets
            </button>
          ) : null}
        </div>

        <div className="wol-acts wol-rv" style={{ '--i': 6 }}>
          <button type="button" className="ui-btn-primary" onClick={() => navigate('/wheel-of-life/check-in')}>
            {inProgress ? 'Continue check-in' : 'Start check-in'}
          </button>
          {count > 0 ? (
            <button type="button" className="ui-btn-ghost" onClick={() => navigate('/wheel-of-life/results')}>See your wheel</button>
          ) : null}
        </div>
      </div>
      <Toast message={message} />
    </div>
  );
}
