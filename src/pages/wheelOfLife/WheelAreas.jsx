import { useContext, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { useDraft } from '../../lib/drafts';
import DesignHeader from '../../components/DesignHeader';
import pageText from '../../content/pageText';
import {
  Button, PageHeader, TextBox, useToast,
} from '../../components/design';
import {
  OWN_NAME_MAX, areaName, differsFromStandard, isDuplicateName, questionFor, sortAreas,
} from '../../lib/wheelOfLife';
import { addOwnArea, resetToStandard, setAreaActive } from '../../lib/wheelOfLifeApi';
import useWheelData from './useWheelData';
import useArrivalToast, { returnPath } from './useArrivalToast';
import WheelFooter from './WheelFooter';
import WheelLoadState from './WheelLoadState';
import { BinIcon } from './icons';
import '../../styles/wheelOfLife.css';

const SAVE_ERROR = 'That change hasn’t saved. Check your connection and try again.';

function split(all) {
  const sorted = sortAreas(all);
  return { all: sorted, active: sorted.filter((a) => a.active), removed: sorted.filter((a) => !a.active) };
}

// /wheel-of-life/areas - "Your areas" from the approved mock-up
// (wheel-of-life.html R.areas). Every add, remove, restore and reset saves
// straight away; if a save fails the change is undone on screen and an
// in-page message says so. Save areas and Back return to where the person
// came from (Start or the one-pager).
export default function WheelAreas() {
  const navigate = useNavigate();
  const location = useLocation();
  const back = returnPath(location.state);
  const toast = useToast();
  useArrivalToast(toast.show);
  const data = useWheelData();
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const { user } = useContext(AuthContext);

  // Typing survives a refresh or a closed tab (Tim, 26 Oct). Once an area
  // is added the box is emptied, which matches what the page opened with,
  // so the draft removes itself; nothing else needs clearing.
  useDraft({
    userId: user?.id,
    name: 'wheel-areas:new-area',
    value: { name: draft },
    ready: !data.loading && !data.error,
    onRestore: (saved) => {
      if (typeof saved?.name === 'string') setDraft(saved.name);
    },
  });

  if (data.loading || data.error) {
    return <WheelLoadState loading={data.loading} error={data.error} onRetry={data.reload} />;
  }

  const { all, active, removed } = data.areas;
  const n = active.length;

  // Shows a change at once; puts the previous list back if the save fails.
  const save = async (optimistic, run, toastOnSuccess) => {
    const before = data.areas;
    if (optimistic) data.setAreas(split(optimistic));
    setPending(true);
    setError('');
    const res = await run();
    setPending(false);
    if (res.error) {
      data.setAreas(before);
      if (res.error.code === 'duplicate' || res.error.code === 'invalid' || res.error.code === 'last_area') {
        toast.error(res.error.message);
      } else {
        // Never the raw error: say what happened, then what to do.
        console.error('Wheel of Life areas change:', res.error);
        setError(SAVE_ERROR);
      }
      return false;
    }
    data.setAreas(res.data.areas);
    const t = toastOnSuccess || res.data.message;
    if (t) toast.show(t);
    return true;
  };

  const toggle = (key, on) => {
    if (pending) return;
    if (!on && n <= 1) return;
    save(all.map((a) => (a.key === key ? { ...a, active: on } : a)), () => setAreaActive(key, on), null);
  };

  const reset = () => {
    if (pending) return;
    save(
      all.map((a) => ({ ...a, active: a.kind === 'standard' })),
      () => resetToStandard(),
      'Back to the ten standard areas.',
    );
  };

  const add = async () => {
    const name = draft.trim();
    if (!name || pending) return;
    const dup = isDuplicateName(name, all);
    if (dup.duplicate) {
      toast.error(dup.message);
      return;
    }
    const optimistic = dup.restore ? all.map((a) => (a.key === dup.restore.key ? { ...a, active: true } : a)) : null;
    const saved = await save(optimistic, () => addOwnArea(name), null);
    if (saved) setDraft('');
  };

  const goBack = () => navigate(back);
  const saveAreas = () => navigate(back, { state: { toast: 'Areas saved. Your wheel and next check-in use them.' } });

  return (
    <div className="ui-root">
      <DesignHeader />
      <div className="plan-page plan-page--form wol-page wol-page--footer wol-enter">
        <div className="wol-head">
          <PageHeader title="Your areas" info={pageText.wheelOfLifeAreas} />
        </div>

        <span className="wol-lab">{`On your wheel · ${n}`}</span>
        <div className="wol-arl">
          {active.map((a, j) => (
            <div className="wol-ar" key={a.key}>
              <b>{String(j + 1).padStart(2, '0')}</b>
              <div className="wol-arin">
                <span className="wol-an">
                  {areaName(a)}
                  {a.kind === 'own' ? <span className="wol-tg wol-tg--c">Your own</span> : null}
                </span>
                <small>{questionFor(a)}</small>
              </div>
              <button
                type="button"
                className="wol-ib"
                aria-label={`Remove ${areaName(a)}`}
                disabled={n <= 1 || pending}
                onClick={() => toggle(a.key, false)}
              >
                <BinIcon />
              </button>
            </div>
          ))}
        </div>
        {n <= 1 ? <p className="wol-hint3">Keep at least one area on your wheel.</p> : null}
        {n > 1 && n < 3 ? <p className="wol-hint3">With fewer than three areas, your wheel shows as Sectional.</p> : null}
        {error ? <p className="plan-save-error" role="alert">{error}</p> : null}

        <div className="wol-addw">
          <div className="wol-addr">
            <TextBox
              id="wol-add"
              label="Add your own area"
              lines="one"
              maxLength={OWN_NAME_MAX}
              autoComplete="off"
              placeholder="e.g. Travel"
              value={draft}
              onChange={setDraft}
              onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
            />
            <Button variant="outline" icon="plus" className="wol-add-btn" disabled={!draft.trim() || pending} onClick={add}>
              Add
            </Button>
          </div>
          <small>New areas start with no history. Their question will read “…how satisfied are you with travel in your life right now?”</small>
        </div>

        {removed.length ? (
          <>
            <span className="wol-lab">{`Removed · ${removed.length}`}</span>
            <div className="wol-arl">
              {removed.map((a) => (
                <div className="wol-ar wol-ar--off" key={a.key}>
                  <b aria-hidden="true" />
                  <div className="wol-arin">
                    <span>{areaName(a)}</span>
                    <small>Past scores kept</small>
                  </div>
                  <button type="button" className="wol-rest" disabled={pending} onClick={() => toggle(a.key, true)}>Restore</button>
                </div>
              ))}
            </div>
          </>
        ) : null}

        {differsFromStandard(all) ? (
          <Button variant="text" className="wol-qlink wol-reset" disabled={pending} onClick={reset}>Go back to the ten standard areas</Button>
        ) : null}
      </div>

      <WheelFooter onBack={goBack} primary={{ label: 'Save areas', onClick: saveAreas }} />
    </div>
  );
}
