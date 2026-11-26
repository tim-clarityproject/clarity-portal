import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import DesignHeader from '../../components/DesignHeader';
import { B2_LINES } from '../../content/pageLines/client';
import DiscardDialog from '../../components/ui/DiscardDialog';
import { Button, Card, MoreLink, PageOpening, Row, useToast } from '../../components/design';
import {
  activeAreas, areaName, newestCheckin, scoreOf, stepTarget, targetStatus,
} from '../../lib/wheelOfLife';
import { setTargets } from '../../lib/wheelOfLifeApi';
import useWheelData from './useWheelData';
import useArrivalToast, { returnPath } from './useArrivalToast';
import WheelLoadState from './WheelLoadState';
import '../../styles/wheelOfLife.css';

const SAVE_FAILED = 'Your targets haven’t saved yet. Check your connection and try again.';

// /life-balance-review/targets - "Your targets" from the approved mock-up
// (wheel-of-life.html R.targets). One optional target per area on the
// wheel; Save targets saves every change in one go and returns to where
// the person came from. Back with unsaved changes asks first.
export default function WheelTargets() {
  const toast = useToast();
  useArrivalToast(toast.show);
  const data = useWheelData();

  if (data.loading || data.error) {
    return <WheelLoadState loading={data.loading} error={data.error} onRetry={data.reload} />;
  }
  return <Targets areas={activeAreas(data.areas.all)} latest={newestCheckin(data.checkins)} />;
}

function Targets({ areas, latest }) {
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

  // Polish 1 (rules 5, 12 to 16): the page opening with its one main button, the targets as a
  // card of hairline rows, each with the reference's counter; no Nekst on a target or a score.
  return (
    <div className="ui-root">
      <DesignHeader />
      <main className="plan-page wol-page wol-page--open wol-enter">
        <div className="wol-back"><MoreLink back onClick={goBack}>Back</MoreLink></div>
        <PageOpening
          title="Your targets"
          line={B2_LINES.lifeBalanceTargets}
          action={<Button variant="primary" onClick={save} disabled={busy}>{busy ? 'Saving' : 'Save targets'}</Button>}
        />
        {error ? <p className="plan-save-error wol-error" role="alert">{error}</p> : null}

        <div className="wol-cards">
          <Card label={`Targets, ${setCount} of ${areas.length} set`}>
            {areas.map((a) => {
              const t = draft[a.key];
              const l = scoreOf(latest, a.key);
              const status = targetStatus(l, t);
              const name = areaName(a);
              return (
                <Row
                  key={a.key}
                  className="wol-area-row wol-target-row"
                  name={name}
                  sub={<>{l == null ? 'No score yet' : `Latest ${l}`}{status ? <>{', '}<em className={status.met ? 'wol-ok' : undefined}>{status.text}</em></> : null}</>}
                >
                  <span className="wol-target-ctl">
                    <span className="ds-count" role="group" aria-label={`Target for ${name}`}>
                      <button type="button" aria-label="Lower target" disabled={t === 0} onClick={() => step(a, -1)}>−</button>
                      <span aria-live="polite">{t == null ? 'None' : t}</span>
                      <button type="button" aria-label="Raise target" disabled={t === 10} onClick={() => step(a, 1)}>+</button>
                    </span>
                    <MoreLink small bare className="wol-row-act" aria-label={`Clear the target for ${name}`} disabled={t == null} onClick={() => clear(a)}>Clear</MoreLink>
                  </span>
                </Row>
              );
            })}
            <p className="wol-note-line">Leave an area without a target if you don’t want one. Targets show on your wheel as a dashed line, and turn mint when you reach them.</p>
          </Card>
        </div>
      </main>
      <DiscardDialog
        isOpen={discardOpen}
        title="Discard your changes?"
        message="Your target changes have not been saved."
        onKeep={() => setDiscardOpen(false)}
        onDiscard={() => { setDiscardOpen(false); navigate(back); }}
      />
    </div>
  );
}
