import { useCallback, useContext, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { useDraft } from '../../lib/drafts';
import DesignHeader from '../../components/DesignHeader';
import { B2_LINES } from '../../content/pageLines/client';
import {
  AddLink, Button, Card, MoreLink, PageOpening, QuickAdd, Row, TextBox, useToast,
} from '../../components/design';
import {
  OWN_NAME_MAX, areaName, differsFromStandard, isDuplicateName, questionFor, sortAreas,
} from '../../lib/wheelOfLife';
import { addOwnArea, resetToStandard, setAreaActive } from '../../lib/wheelOfLifeApi';
import useWheelData from './useWheelData';
import useArrivalToast, { returnPath } from './useArrivalToast';
import WheelLoadState from './WheelLoadState';
import '../../styles/wheelOfLife.css';

const SAVE_ERROR = 'That change hasn’t saved. Check your connection and try again.';

function split(all) {
  const sorted = sortAreas(all);
  return { all: sorted, active: sorted.filter((a) => a.active), removed: sorted.filter((a) => !a.active) };
}

// /life-balance-review/areas - "Your areas" from the approved mock-up
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
  const [adding, setAdding] = useState(() => false);
  const closeAdd = useCallback(() => setAdding(false), []);
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
      if (typeof saved?.name === 'string') { setDraft(saved.name); if (saved.name.trim()) setAdding(true); }
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
    if (saved) {
      setDraft('');
      setAdding(false);
    }
  };

  const goBack = () => navigate(back);
  const saveAreas = () => navigate(back, { state: { toast: 'Areas saved. Your wheel and next check-in use them.' } });

  // Polish 1 (rules 10 and 12 to 16): the page opening with its one main button, the areas as a
  // card of hairline rows with "+ Add" (Quick Add) at the right of its label, and no Nekst on the
  // areas' numbers. Every add, remove and restore still saves at once.
  return (
    <div className="ui-root">
      <DesignHeader />
      <main className="plan-page wol-page wol-page--open wol-enter">
        <div className="wol-back"><MoreLink back onClick={goBack}>Back</MoreLink></div>
        <PageOpening
          title="Your areas"
          line={B2_LINES.lifeBalanceAreas}
          action={<Button variant="primary" onClick={saveAreas}>Save areas</Button>}
        />

        <div className="wol-cards">
          <Card
            label={`On your wheel, ${n}`}
            add={<AddLink label="Add your own area" expanded={adding} controls="wol-add-area" onClick={() => setAdding(true)} />}
            quickAdd={(
              <QuickAdd id="wol-add-area" open={adding} onClose={closeAdd} onAdd={add} label="Add your own area" addLabel="Add area">
                <TextBox
                  id="wol-add"
                  label="Name your area"
                  lines="one"
                  maxLength={OWN_NAME_MAX}
                  autoComplete="off"
                  placeholder="e.g. Travel"
                  value={draft}
                  onChange={setDraft}
                  onKeyDown={(e) => { if (e.key === 'Enter') add(); if (e.key === 'Escape') closeAdd(); }}
                />
                <p className="wol-note-line">New areas start with no history.</p>
              </QuickAdd>
            )}
          >
            {active.map((a, j) => (
              <Row
                key={a.key}
                className="wol-area-row"
                name={<><span className="wol-area-n">{j + 1}</span>{areaName(a)}</>}
                sub={a.kind === 'own' ? `Your own. ${questionFor(a)}` : questionFor(a)}
              >
                <MoreLink small bare className="wol-row-act" aria-label={`Remove ${areaName(a)}`} disabled={n <= 1 || pending} onClick={() => toggle(a.key, false)}>Remove</MoreLink>
              </Row>
            ))}
            {n <= 1 ? <p className="wol-note-line">Keep at least one area on your wheel.</p> : null}
            {n > 1 && n < 3 ? <p className="wol-note-line">With fewer than three areas, your wheel shows as Sectional.</p> : null}
            {error ? <p className="plan-save-error" role="alert">{error}</p> : null}
          </Card>

          {removed.length ? (
            <Card label={`Removed, ${removed.length}`}>
              {removed.map((a) => (
                <Row key={a.key} className="wol-area-row" name={areaName(a)} sub="Past scores kept">
                  <MoreLink small bare className="wol-row-act" aria-label={`Restore ${areaName(a)}`} disabled={pending} onClick={() => toggle(a.key, true)}>Restore</MoreLink>
                </Row>
              ))}
            </Card>
          ) : null}
        </div>

        {differsFromStandard(all) ? (
          <div className="wol-foot-links">
            <MoreLink bare onClick={reset} disabled={pending}>Go back to the ten standard areas</MoreLink>
          </div>
        ) : null}
      </main>
    </div>
  );
}
