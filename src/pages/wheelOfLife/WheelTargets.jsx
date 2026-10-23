import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import DesignHeader from '../../components/DesignHeader';
import PageHeading from '../../components/PageHeading';
import DiscardDialog from '../../components/ui/DiscardDialog';
import Toast from '../../components/ui/Toast';
import useToast from '../../hooks/useToast';
import { Crosshair } from '../../components/design';
import {
  activeAreas, areaName, newestCheckin, scoreOf, stepTarget, targetStatus,
} from '../../lib/wheelOfLife';
import { setTargets } from '../../lib/wheelOfLifeApi';
import useWheelData from './useWheelData';
import useArrivalToast, { returnPath } from './useArrivalToast';
import WheelFooter from './WheelFooter';
import WheelLoadState from './WheelLoadState';
import '../../styles/wheelOfLife.css';

const SAVE_FAILED = 'Your targets haven’t saved yet. Check your connection and try again.';

// /wheel-of-life/targets - "Your targets" from the approved mock-up
// (wheel-of-life.html R.targets). One optional target per area on the
// wheel; Save targets saves every change in one go and returns to where
// the person came from. Back with unsaved changes asks first.
export default function WheelTargets() {
  const { message, showToast } = useToast();
  useArrivalToast(showToast);
  const data = useWheelData();

  if (data.loading || data.error) {
    return <WheelLoadState loading={data.loading} error={data.error} onRetry={data.reload} toast={message} />;
  }
  return <Targets areas={activeAreas(data.areas.all)} latest={newestCheckin(data.checkins)} toast={message} />;
}

function Targets({ areas, latest, toast }) {
  const navigate = useNavigate();
  const location = useLocation();
  const back = returnPath(location.state);
  const saved = Object.fromEntries(areas.map((a) => [a.key, a.target ?? null]));
  const [draft, setDraft] = useState(saved);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const changes = Object.fromEntries(Object.entries(draft).filter(([k, t]) => t !== saved[k]));
  const dirty = Object.keys(changes).length > 0;
  const setCount = areas.filter((a) => draft[a.key] != null).length;

  const step = (a, dir) => {
    setDraft((d) => ({ ...d, [a.key]: stepTarget(d[a.key], scoreOf(latest, a.key), dir) }));
  };
  const clear = (a) => setDraft((d) => ({ ...d, [a.key]: null }));

  const goBack = () => {
    if (dirty) setDiscardOpen(true);
    else navigate(back);
  };

  const save = async () => {
    if (busy) return;
    if (dirty) {
      setBusy(true);
      setError('');
      const res = await setTargets(changes);
      if (res.error) {
        setBusy(false);
        setError(res.error.code === 'network' ? SAVE_FAILED : res.error.message);
        return;
      }
    }
    navigate(back, { state: { toast: 'Targets saved.' } });
  };

  return (
    <div className="ui-root">
      <DesignHeader />
      <div className="plan-page plan-page--form wol-page wol-page--footer wol-enter">
        <div className="wol-head">
          <PageHeading pageKey="wheelOfLifeTargets" title="Your targets" />
        </div>

        <span className="wol-lab">{`Targets · ${setCount} of ${areas.length} set`}</span>
        <div className="wol-tgl">
          {areas.map((a) => {
            const t = draft[a.key];
            const l = scoreOf(latest, a.key);
            const status = targetStatus(l, t);
            const name = areaName(a);
            return (
              <div className="wol-tgr" key={a.key}>
                <div className="wol-tgn">
                  <span>{name}</span>
                  <small>
                    {`Latest ${l == null ? '–' : l}`}
                    {status ? <>{' · '}<em className={status.met ? 'wol-ok' : undefined}>{status.text}</em></> : null}
                  </small>
                </div>
                <div className="wol-stp" role="group" aria-label={`Target for ${name}`}>
                  <button type="button" aria-label="Lower target" disabled={t === 0} onClick={() => step(a, -1)}>−</button>
                  <b className={t == null ? 'wol-none' : undefined}>{t == null ? '–' : t}</b>
                  <button type="button" aria-label="Raise target" disabled={t === 10} onClick={() => step(a, 1)}><Crosshair size="sm" /></button>
                </div>
                <button type="button" className="wol-clr" disabled={t == null} onClick={() => clear(a)}>Clear</button>
              </div>
            );
          })}
        </div>
        <p className="wol-tnote">Leave an area without a target if you don’t want one. Targets show on your wheel as a dashed line, and turn mint when you reach them.</p>
      </div>

      <WheelFooter
        onBack={goBack}
        primary={{ label: 'Save targets', busyLabel: 'Saving', onClick: save, busy, error }}
      />
      <DiscardDialog
        isOpen={discardOpen}
        title="Discard your changes?"
        message="Your target changes have not been saved."
        onKeep={() => setDiscardOpen(false)}
        onDiscard={() => { setDiscardOpen(false); navigate(back); }}
      />
      <Toast message={toast} clearBarVar="--wol-bar-height" />
    </div>
  );
}
