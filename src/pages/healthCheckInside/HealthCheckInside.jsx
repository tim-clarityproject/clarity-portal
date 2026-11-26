import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { B3_LINES } from '../../content/pageLines/client';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import DesignHeader from '../../components/DesignHeader';
import { PageOpening,
  AddButton, BottomBar, Button, CalmCard, LoadError, Loading, OfferRow, OneOffTip, PageHeader, PdfPanel, PlayButton, ResultsSection,
  TitleIcons, VersionList, VersionRow, WhoSees, useCoachName, useOffer, useToast,
} from '../../components/design';
import { HEALTH_CHECK_GUIDE_OFFER } from '../../lib/offers';
import { HEALTH_CHECKS_MOVED } from '../../lib/guest/claimRules';
import { useStartChat } from '../../components/coach/startChat';
import { supabase } from '../../lib/supabase';
import { useCachedLoad, readCache, writeCache } from '../../lib/pageCache';
import { clearDraft, readDraft, useDraft } from '../../lib/drafts';
import { guardRows, newId, saveOrQueue, useSuperseded } from '../../lib/syncQueue';
import { friendlyError } from '../../lib/friendlyError';
import { loadWithReload } from '../../lib/loadWithReload';
import { dataFromDraft, draftFromData } from '../alignment/alignmentFlow';
import { at, stepFromJson, stepToJson } from '../../health-check/flow';
import {
  BASE, TOOL_NAME, TOOL_TYPE, claimedTip, compareVersions, copiedLine, hasAnswers, isWhole, nameTaken, newTeamVersion, newVersionFrom,
  rowFrom, shortHeadline, teamOf, teamsFrom, versionDate, versionLabel, versionName,
} from '../../lib/healthCheck/inside';
import { BackLink, ExampleReport, GuidePanel, HealthCheckCompare, HealthCheckResults, HealthCheckTool } from '../healthCheck';
import TextField from '../../components/design/TextField';
import './inside.css';
import { TOOL_CLOSED } from '../../content/pageLines/client';

// The Strategic Alignment Health Check inside the portal (mock-up M7
// version 8.2, read in full with its notes): Your teams, each with its dated
// versions; a version's results in the portal frame, ending with Versions;
// a new version from a copy of the last; a new team; Compare two versions;
// and the example report. The guided screens and the one-pager are the
// outside Health Check's own, word for word (src/pages/healthCheck).
//
// Addresses (the older pages' seven addresses and /decision-summary come
// here with their query, hash and state):
//   /strategic-alignment                 Your teams
//   /strategic-alignment/example         the example report
//   /strategic-alignment/new?team=<id>   a new version of a team (its draft, if it has one)
//   /strategic-alignment/new-team        a Health Check for a new team
//   /strategic-alignment/version/<id>    a version: its results, or its questions while it's being made
//   /strategic-alignment/compare?team=<id>&a=<id>&b=<id>
//
// Where it is kept: src/lib/healthCheck/inside.js (one `decisions` row per
// version, through the offline queue; the typing on the device as a draft
// until it is saved, "Draft restored").

const CACHE = 'health-checks';
const CURRENT = 'health-check-current'; // the version being made on this device, for Home's "Carry on"
const TITLE = TOOL_NAME;
const SAVE_ERROR = 'That didn’t save. Check your connection and try again.';
const LOAD_ERROR = 'Your Health Checks didn’t load. Check your connection and try again.';
const TIP_SEEN = 'health-check-tips-closed';
// The eye's choice on Your teams before there is a Health Check to keep it
// on: kept on the device, and the first team starts with it (the
// functionality tester, 15 Nov).
const SHARE_PREF = 'health-check-share';
const sharedPref = (userId) => readCache(userId, SHARE_PREF)?.v !== false;
const isId = (v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const draftName = (id) => `health-check:${id}`;
const CHANGED_ELSEWHERE = 'This version changed in another tab.';

// Two tabs on one version (follow-up 1, step 3): each save is sent as "only
// if the version is still as this tab opened it" (or as this tab last saved
// it). By id: the version as its page opened it (Version), then as this
// tab's own saves left it; while its page is open a quiet refresh never moves
// it on, so a change made in another tab is never written over. A version
// with no page open (the team list's eye) follows the last read. A version
// the database doesn't have yet is made "only if no other tab has made it"
// (its first save); after that this tab's saves follow on. Refused: "This
// version changed in another tab." with "Reload to see it".
const bases = new Map();
const openNow = new Map(); // id -> how many of its pages are open in this tab
const createdHere = new Set();
const sayChanged = { current: () => {} };

async function loadRows(userId) {
  const { data, error } = await supabase.from('decisions')
    .select('id, title, form_data, status, draft, tool_type, created_at, updated_at')
    .eq('user_id', userId).eq('tool_type', TOOL_TYPE).order('created_at', { ascending: true });
  if (error) throw error;
  (data || []).forEach((r) => { if (r?.id && r.updated_at && !openNow.get(r.id)) bases.set(r.id, r.updated_at); });
  guardRows('decisions', data);
  return data || [];
}

/** A version kept on the device (a draft) back as a version the screens can draw. */
// Read field by field, never spread over (Get unstuck rule 15): a copy that
// was damaged, or kept by another version, opens as far as it can be read.
const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const isDayKey = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
function fromDevice(v) {
  if (!isObject(v) || !isId(v.id) || !isObject(v.data)) return null;
  const text = (x) => typeof x === 'string' && x.length > 0 && x.length < 200;
  const blank = newTeamVersion({ id: v.id, teamId: text(v.teamId) ? v.teamId : newId() });
  return {
    ...blank,
    teamName: typeof v.teamName === 'string' ? v.teamName.slice(0, 80) : '',
    date: isDayKey(v.date) ? v.date : blank.date,
    createdAt: typeof v.createdAt === 'string' ? v.createdAt : null,
    // Only a version saved on the server is finished; a device copy is one being made.
    status: v.status === 'draft' ? 'draft' : 'new',
    shared: v.shared !== false,
    draft: draftFromData(v.data),
    step: isObject(v.step) ? v.step : null,
    made: v.made === 'team' ? 'team' : 'version',
    from: text(v.from) ? v.from : null,
    fromOutside: isObject(v.fromOutside) ? v.fromOutside : null,
    old: v.old === true,
    row: null,
  };
}
/** A version as the device keeps it (the answers in their saved shape). */
const forDevice = (v, step) => {
  const { draft, ...rest } = v;
  // The saved shape (blank rows dropped) is what goes on the device.
  return { ...rest, row: null, step: step || v.step || null, data: draft ? dataFromDraft(draft) : {} };
};

export default function HealthCheckInside() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const location = useLocation();
  const rest = location.pathname.replace(/^\/strategic-alignment\/?/, '').replace(/\/+$/, '');
  const load = useCachedLoad({ userId, name: CACHE, load: () => loadRows(userId) });
  // A damaged or older device copy never stops the page (Get unstuck rule
  // 15; the break-it tester, 15 Nov): only rows with an id are read, and
  // the database's answer replaces the copy.
  const rows = useMemo(() => (Array.isArray(load.data) ? load.data.filter((r) => r && typeof r === 'object' && isId(r.id)) : []), [load.data]);
  const teams = useMemo(() => teamsFrom(rows), [rows]);
  // A Health Check moved in from outside after sign-in (App.jsx's claim)
  // shows at once, with its one-off tip (the functionality tester, 15 Nov).
  const reload = load.reload;
  useEffect(() => {
    const onMoved = () => { reload(); };
    window.addEventListener(HEALTH_CHECKS_MOVED, onMoved);
    return () => window.removeEventListener(HEALTH_CHECKS_MOVED, onMoved);
  }, [reload]);

  // A save refused because the version changed in another tab: said calmly,
  // with a way to see it. The typing kept on the device for that version
  // goes, so the reload shows the other tab's version, not this one again.
  const [changed, setChanged] = useState(false);
  // A new version another tab made first (useSaver): the device's copy goes
  // back to the database's on the reload.
  useEffect(() => {
    sayChanged.current = () => setChanged(true);
    return () => { sayChanged.current = () => {}; };
  }, []);
  useSuperseded(['decisions'], (error) => {
    if (error.row && error.row.tool_type !== TOOL_TYPE) return;
    if (error.row?.id) {
      clearDraft(userId, draftName(error.row.id));
      // The device's copy goes back to the database's version, so "Reload to
      // see it" shows that, never this tab's refused change.
      load.setData((list) => (list || []).map((r) => (r?.id === error.row.id ? error.row : r)));
    }
    setChanged(true);
  });

  // An older page's address, or My Plans, handing over a saved Health Check.
  const handed = location.state?.decisionId;
  if (!rest && isId(handed)) return <Navigate to={`${BASE}/version/${handed}`} replace />;

  const page = (() => {
    if (!userId || (load.loading && !load.data)) {
      return <Frame><Loading label="Loading your Health Checks" className="ds-loading--page" /></Frame>;
    }
    const failed = load.error && !load.data;
    const store = { userId, rows, teams, setRows: load.setData, failed };

    if (rest === 'example') return <ExamplePage />;
    if (failed && rest !== 'new-team') return <Frame back><LoadError>{LOAD_ERROR}</LoadError></Frame>;
    if (rest === '') return <TeamsPage store={store} />;
    if (rest === 'compare') return <ComparePage store={store} />;
    if (rest === 'new' || rest === 'new-team') return <StartNew store={store} teamId={rest === 'new' ? new URLSearchParams(location.search).get('team') : null} />;
    const m = /^version\/([^/]+)$/.exec(rest);
    if (m && isId(m[1])) return <VersionPage key={m[1]} store={store} id={m[1]} />;
    return <Navigate to={BASE} replace />;
  })();
  return (
    <>
      {page}
      {changed && (
        <div className="ui-root ds-portal">
          <div className="ds-toast-region hc-in-changed" role="alert">
            <div className="ds-toast ds-toast--shown">
              <span className="ds-toast-text">{CHANGED_ELSEWHERE}</span>
              <button type="button" className="ds-toast-undo" onClick={() => window.location.reload()}>Reload to see it</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** A page in the portal frame (M7: the menu crosshair, My Mission, Chat to Tim, the phone bar). */
function Frame({ children, back = false, foot = null }) {
  const navigate = useNavigate();
  return (
    <div className="ui-root">
      <DesignHeader />
      <main className={`hc-in-page${foot ? ' hc-in-page--foot' : ''}`}>
        {back && <BackLink onClick={() => navigate(BASE)} />}
        {children}
      </main>
      {foot}
    </div>
  );
}

// ------------------------------------------------------------ saving

function useSaver(store) {
  const { userId, setRows } = store;
  return useCallback(async (version, status, step = null) => {
    const values = rowFrom(version, userId, status, step);
    if (!version.createdAt) values.created_at = new Date().toISOString();
    // The list shows it at once; the queue sends it (or keeps it offline).
    // Its updated_at stays the database's until the save lands (it is what
    // the next opening bases its saves on), never this device's clock.
    setRows((list) => {
      const all = list || [];
      const i = all.findIndex((r) => r.id === values.id);
      const row = { ...(i >= 0 ? all[i] : {}), ...values, ...(i >= 0 && all[i].updated_at ? { updated_at: all[i].updated_at } : {}) };
      return i >= 0 ? all.map((r, j) => (j === i ? row : r)) : [...all, row];
    });
    const basedOn = bases.get(values.id);
    // A version the database doesn't have yet: made only if no other tab has made it.
    const first = !basedOn && !createdHere.has(values.id);
    guardRows('decisions', [values]);
    const result = await saveOrQueue(userId, {
      table: 'decisions', kind: 'upsert', onConflict: 'id', values,
      ...(basedOn ? { basedOn } : {}), ...(first ? { ignoreDuplicates: true } : {}),
    });
    // Changed in another tab since: nothing was written (the page says so).
    if (result?.status === 'superseded') throw Object.assign(new Error(CHANGED_ELSEWHERE), { superseded: true });
    if (first && result?.status === 'saved' && Array.isArray(result.data) && result.data.length === 0) {
      // Another tab made it first: nothing was written over.
      clearDraft(userId, draftName(values.id));
      sayChanged.current(values.id);
      throw Object.assign(new Error(CHANGED_ELSEWHERE), { superseded: true });
    }
    if (first) createdHere.add(values.id);
    const at = result?.data?.[0]?.updated_at;
    if (at) {
      bases.set(values.id, at);
      setRows((list) => (list || []).map((r) => (r?.id === values.id ? { ...r, updated_at: at } : r)));
    }
    return { status: result?.status, row: values };
  }, [userId, setRows]);
}

function useDeleter(store) {
  const { userId, setRows } = store;
  const toast = useToast();
  return useCallback(async (list, done) => {
    const ids = new Set(list.map((r) => r.id));
    try {
      await Promise.all(list.map((r) => saveOrQueue(userId, { table: 'decisions', kind: 'delete', match: { id: r.id, user_id: userId } })));
    } catch (error) {
      toast.error(friendlyError(error, 'That didn’t delete. Check your connection and try again.'));
      return;
    }
    setRows((all) => (all || []).filter((r) => !ids.has(r.id)));
    list.forEach((r) => { clearDraft(userId, draftName(r.id)); bases.delete(r.id); });
    if (readCache(userId, CURRENT)?.v?.id && ids.has(readCache(userId, CURRENT).v.id)) writeCache(userId, CURRENT, null);
    done?.();
    // Deleted, with Undo (rule 28): the same rows go back.
    toast.saved({
      message: 'Deleted',
      onUndo: async () => {
        setRows((all) => [...(all || []), ...list]);
        try {
          await Promise.all(list.map((r) => saveOrQueue(userId, { table: 'decisions', kind: 'upsert', onConflict: 'id', values: { ...r, user_id: userId } })));
        } catch (error) {
          toast.error(friendlyError(error, SAVE_ERROR));
        }
      },
    });
  }, [userId, setRows, toast]);
}

// ------------------------------------------------------------ the eye

/** "Only you" or "You and Tim" (M7 "Who can see this"): saved there and then. */
function Eye({ shared, onShare }) {
  return <WhoSees plain audience={shared ? 'coach' : 'me'} onChange={(audience) => onShare(audience === 'coach')} />;
}

// ------------------------------------------------------------ Your teams

function TeamsPage({ store }) {
  const navigate = useNavigate();
  const save = useSaver(store);
  const { teams, userId } = store;
  const [guide, setGuide] = useState(false);
  const [closedTips, setClosedTips] = useState(() => readCache(userId, TIP_SEEN)?.v || []);

  // One first-visit message at a time (5e rule 8): the Quick guide's offer
  // row first (OfferRow, M7 version 8.2; Not now offers it on the next 2
  // visits, then stops); the one-off tip about an outside Health Check waits
  // until it has gone. While the row shows, the title's play icon hides, so
  // the Quick guide is offered once (Tim, 14 Nov, 10:19).
  const guideOffer = useOffer(HEALTH_CHECK_GUIDE_OFFER);
  const offer = guideOffer.show ? (
    <OfferRow
      action="Watch the Quick guide"
      detail="~1 minute"
      onTake={() => { guideOffer.take(); setGuide(true); }}
      onNotNow={guideOffer.notNow}
      never={guideOffer.never}
      onNever={guideOffer.stop}
    />
  ) : null;
  const tip = offer ? null : claimedTip(teams, (id) => closedTips.includes(id));
  const closeTip = () => {
    const next = [...closedTips, tip.id];
    setClosedTips(next);
    writeCache(userId, TIP_SEEN, next);
  };

  // The eye here says who sees every Health Check: choosing saves each
  // version (and new ones copy it).
  const all = teams.flatMap((t) => [...t.versions, ...t.drafts]);
  const [pref, setPref] = useState(() => sharedPref(userId));
  const shared = all.length ? all.every((v) => v.shared) : pref;
  const shareAll = async (on) => {
    writeCache(userId, SHARE_PREF, on);
    setPref(on);
    const changed = all.filter((v) => v.shared !== on);
    const went = await Promise.allSettled(changed.map((v) => save({ ...v, shared: on }, v.status === 'draft' ? 'draft' : 'completed', v.step)));
    const missed = went.filter((r) => r.status === 'rejected');
    if (missed.some((r) => !r.reason?.superseded)) throw missed.find((r) => !r.reason?.superseded).reason;
    if (missed.length) return { say: CHANGED_ELSEWHERE };
    return undefined;
  };

  const icons = (
    <TitleIcons>
      {guideOffer.titleIcon && <PlayButton label="Quick guide" onClick={() => setGuide(true)} />}
      <Eye shared={shared} onShare={shareAll} />
    </TitleIcons>
  );

  return (
    <Frame>
      <PageOpening title={TITLE} aside={icons} line={B3_LINES.strategicAlignment} />
      {offer}
      {tip && <OneOffTip onClose={closeTip}>{tip.text}</OneOffTip>}
      {teams.map((t) => (
        <ResultsSection key={t.id} row rows title={t.name} className="hc-in-team">
          {t.versions.length > 0 && (
            <VersionList label={t.name}>
              {t.versions.map((v) => (
                <VersionRow
                  key={v.id}
                  name={versionName(v)}
                  line={shortHeadline(v.draft)}
                  date={versionDate(v.date)}
                  onClick={() => navigate(`${BASE}/version/${v.id}`)}
                />
              ))}
            </VersionList>
          )}
          <div className="hc-in-tacts">
            {t.draft
              ? <Button variant="text" onClick={() => navigate(`${BASE}/version/${t.draft.id}`)}>Carry on with my new version</Button>
              : <Button variant="text" onClick={() => navigate(`${BASE}/new?team=${encodeURIComponent(t.id)}`)}>Start a new version</Button>}
          </div>
        </ResultsSection>
      ))}
      {teams.length > 0 ? (
        <div className="hc-in-add"><AddButton onClick={() => navigate(`${BASE}/new-team`)}>Add another team</AddButton></div>
      ) : (
        <>
          <CalmCard line="Which team’s work would you like to check against its strategy?">
            <Button variant="primary" onClick={() => navigate(`${BASE}/new-team`)}>Start a Health Check</Button>
          </CalmCard>
          <div className="hc-in-example"><Button variant="text" onClick={() => navigate(`${BASE}/example`)}>See an example report</Button></div>
        </>
      )}
      <GuidePanel inside open={guide} onClose={() => setGuide(false)} onWatched={() => {}} />
    </Frame>
  );
}

// ------------------------------------------------------------ the example

function ExamplePage() {
  const navigate = useNavigate();
  const toast = useToast();
  return (
    <Frame back>
      <PageHeader title="Example report" />
      <ExampleReport onEdit={() => toast.show('The example can’t be edited.')} />
      <div className="hc-end"><Button variant="primary" onClick={() => navigate(`${BASE}/new-team`)}>Start my Health Check</Button></div>
    </Frame>
  );
}

// ------------------------------------------------------------ starting

/** A new version of a team (its draft when it has one), or a new team: given its own id, then opened. */
function StartNew({ store, teamId }) {
  const { teams, userId } = store;
  const [target] = useState(() => {
    if (teamId) {
      const team = teams.find((t) => t.id === teamId);
      if (!team) return { to: BASE };
      if (team.draft) return { to: `${BASE}/version/${team.draft.id}` };
      const latest = team.versions[0];
      if (!latest) return { to: BASE };
      const fresh = newVersionFrom(latest, { id: newId() });
      // Kept on the device, so the version's own address finds it.
      writeCache(userId, `${CACHE}:fresh:${fresh.id}`, forDevice(fresh));
      return { to: `${BASE}/version/${fresh.id}` };
    }
    // A new team: its eye starts as the person's others (You and Tim when there are none).
    const all = teams.flatMap((t) => t.versions);
    const fresh = newTeamVersion({ id: newId(), teamId: newId(), shared: all.length ? all.every((v) => v.shared) : sharedPref(userId) });
    writeCache(userId, `${CACHE}:fresh:${fresh.id}`, forDevice(fresh));
    return { to: `${BASE}/version/${fresh.id}` };
  });
  return <Navigate to={target.to} replace />;
}

// ------------------------------------------------------------ a version

function VersionPage({ store, id }) {
  const { rows, teams, userId } = store;
  const saved = rows.find((r) => r.id === id) || null;
  const [start] = useState(() => {
    if (saved) return null;
    const kept = readCache(userId, `${CACHE}:fresh:${id}`)?.v || readDraft(userId, draftName(id))?.v;
    return fromDevice(kept);
  });
  const version = useMemo(() => {
    if (saved) return teamsFrom([saved]).flatMap((t) => [...t.versions, ...t.drafts])[0];
    return start;
  }, [saved, start]);
  if (!version) return <Frame back><LoadError>This Health Check isn’t here any more. It may have been deleted.</LoadError></Frame>;
  return <Version store={store} start={version} team={teamOf(teams, id)} />;
}

function Version({ store, start, team }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { userId, teams } = store;
  const save = useSaver(store);
  const remove = useDeleter(store);
  const [item, setItem] = useState(start);
  const itemRef = useRef(item);
  itemRef.current = item;
  // The version as this page opened it is what its saves are based on.
  const openedAt = start.row?.updated_at || null;
  useState(() => { if (openedAt) bases.set(start.id, openedAt); return null; });
  useEffect(() => {
    openNow.set(start.id, (openNow.get(start.id) || 0) + 1);
    return () => {
      const n = (openNow.get(start.id) || 1) - 1;
      if (n) openNow.set(start.id, n); else openNow.delete(start.id);
    };
  }, [start.id]);
  // Where the questions are, as saved (flow.js stepToJson), for the
  // device's copy, the draft row and opening again.
  const stepRef = useRef(start.step);
  const [step, setStep] = useState(start.step);
  const onStep = useCallback((st) => {
    const json = stepToJson(st);
    stepRef.current = json;
    setStep(json);
  }, []);
  const made = item.status !== 'completed';
  // The results show as a page; the questions show while it is being made, or edited.
  const [mode, setMode] = useState(made ? 'tool' : 'results');
  const [edit, setEdit] = useState(null);
  const [toolN, setToolN] = useState(0);
  const [panel, setPanel] = useState(null); // 'pdf' | 'guide'
  const [sort, setSort] = useState('att');
  const busy = useRef(false);

  // The typing is kept on the device until it is saved ("Draft restored").
  const draft = useDraft({
    userId,
    // Only while the questions show: the results page keeps nothing here.
    name: mode === 'tool' ? draftName(item.id) : null,
    value: forDevice(item, step),
    ready: true,
    onRestore: (d) => {
      const back = fromDevice(d);
      if (!back || back.id !== start.id) return;
      setItem((s) => ({ ...s, draft: back.draft, teamName: back.teamName || s.teamName, shared: back.shared ?? s.shared }));
      if (back.step) { stepRef.current = back.step; setStep(back.step); }
      setMode('tool');
      setToolN((n) => n + 1);
    },
  });
  // Home's "Carry on where you left off": the version being made here.
  useEffect(() => {
    // A new team with nothing typed but its name isn't kept (M7), so it isn't
    // offered either (the functionality tester, 15 Nov).
    if (mode === 'tool' && made && (item.status === 'draft' || hasAnswers(item.draft))) writeCache(userId, CURRENT, { id: item.id, at: Date.now() });
  }, [mode, made, userId, item.id, item.status, item.draft]);
  // `done`: finished or let go, so Home stops offering to carry it on.
  const forget = ({ done = true } = {}) => {
    draft.clear();
    writeCache(userId, `${CACHE}:fresh:${item.id}`, null);
    if (done && readCache(userId, CURRENT)?.v?.id === item.id) writeCache(userId, CURRENT, null);
  };

  const onDraft = useCallback((fn) => {
    setItem((s) => {
      const next = fn(s.draft);
      return next === s.draft ? s : { ...s, draft: next };
    });
  }, []);

  const keep = async (status, { quiet = false, words = 'Saved' } = {}) => {
    const now = itemRef.current;
    try {
      const result = await save(now, status, stepRef.current || stepToJson(at('objective')));
      const createdAt = now.createdAt || result.row.created_at;
      setItem((s) => ({ ...s, status, createdAt, row: result.row }));
      if (!quiet) toast.show(result.status === 'queued' ? 'Will sync' : words);
      return true;
    } catch (error) {
      if (error?.superseded) return false; // said by the page's own message
      toast.error(friendlyError(error, SAVE_ERROR));
      return false;
    }
  };

  // The last answer, "Save my edit" or "Back to results": the results page.
  const onResults = async () => {
    const now = itemRef.current;
    const whole = isWhole(now.draft);
    if (whole && !now.draft.completedAt) {
      const done = { ...now, draft: { ...now.draft, completedAt: new Date().toISOString() } };
      itemRef.current = done;
      setItem(done);
    }
    // The results show at once; the save follows (the queue keeps it offline).
    // The device's draft goes first: the list's own copy and the queue hold it now.
    // "Saved" once the save has really gone (never before: the version may
    // have changed in another tab, follow-up 1), so the tool's own is off.
    const saving = keep('completed');
    forget();
    setEdit(null);
    setMode('results');
    window.scrollTo(0, 0);
    await saving;
  };

  // Close (and Back on the first step): a version being made is kept as a
  // draft ("Saved"; the team list offers "Carry on with my new version"); a
  // new team with nothing typed but its name is let go (M7); an edit of a
  // finished version saves it and shows its results.
  const close = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const now = itemRef.current;
      if (now.status === 'completed') {
        await onResults();
        return;
      }
      if (now.made === 'team' && !hasAnswers(now.draft) && now.status === 'new') {
        forget();
        navigate(BASE, { replace: true });
        return;
      }
      if (!now.teamName.trim()) {
        // A team needs its name before anything is kept.
        forget();
        navigate(BASE, { replace: true });
        return;
      }
      if (await keep('draft', { words: TOOL_CLOSED })) {
        forget({ done: false });
        navigate(BASE, { replace: true });
      }
    } finally {
      busy.current = false;
    }
  };

  const share = async (on) => {
    const next = { ...itemRef.current, shared: on };
    itemRef.current = next;
    setItem(next);
    if (next.status !== 'new' || hasAnswers(next.draft)) {
      let result;
      try {
        result = await save(next, next.status === 'completed' ? 'completed' : 'draft', stepRef.current || stepToJson(at('objective')));
      } catch (error) {
        if (error?.superseded) return { say: CHANGED_ELSEWHERE };
        throw error;
      }
      setItem((s) => ({ ...s, status: s.status === 'new' ? 'draft' : s.status, createdAt: s.createdAt || result.row.created_at, row: result.row }));
    }
  };
  const eye = <Eye shared={item.shared} onShare={share} />;

  // ---- the guided screens ----
  if (mode === 'tool') {
    const source = item.from ? teams.flatMap((x) => x.versions).find((v) => v.id === item.from) : null;
    const lead = !made ? null : item.made === 'team'
      ? {
        key: 'team',
        name: 'Team',
        question: 'Which team is this Health Check for?',
        nudges: ['Use the name your organisation knows it by.'],
        eye,
        check: () => {
          const name = itemRef.current.teamName.trim();
          if (!name) return 'Type the team’s name to carry on.';
          if (nameTaken(teams, name, item.teamId)) return 'You already have a team with that name. Give this one another name.';
          return null;
        },
        render: () => (
          <TextField
            className="hc-in-team-field"
            label="Team"
            placeholder="e.g. Leadership team"
            autoComplete="off"
            maxLength={80}
            value={item.teamName}
            onChange={(e) => {
              const v = e.target.value;
              setItem((s) => ({ ...s, teamName: v.slice(0, 80) }));
            }}
          />
        ),
      }
      : {
        key: 'newv',
        name: 'New version',
        question: 'Let’s start from your last answers.',
        nudges: ['Rate each project as it stands today.'],
        eye,
        nextLabel: 'Start my new version',
        render: () => (
          <>
            <div className="hc-example-intro hc-in-copied">
              <p className="hc-in-k2">{item.teamName}</p>
              {source && <p>{`${versionName(source)}, ${versionDate(source.date)}`}</p>}
            </div>
            <p className="hc-lead">{copiedLine(item.draft)}</p>
            <p className="hc-lead hc-in-lead2">Your earlier ratings stay with your earlier version.</p>
          </>
        ),
      };
    const opening = step?.screen === 'lead' || (!step && lead)
      ? at('lead')
      : step ? stepFromJson(step, item.draft, false) : undefined;
    return (
      <div className="ui-root">
        <HealthCheckTool
          key={toolN}
          draft={item.draft}
          onDraft={onDraft}
          reached={!made || item.old}
          initialStep={edit ? undefined : opening}
          onStep={onStep}
          eye={eye}
          onGuide={() => setPanel('guide')}
          title={TITLE}
          asOf={item.date}
          lead={lead}
          onResults={onResults}
          onEdited={() => {}}
          editOn={edit}
          onClose={close}
          onBack={close}
        />
        <GuidePanel inside open={panel === 'guide'} onClose={() => setPanel(null)} onWatched={() => {}} />
      </div>
    );
  }

  // ---- the results, in the portal frame ----
  const t = team || { id: item.teamId, name: item.teamName, versions: [item], draft: null };
  const openEdit = (what) => {
    setEdit(what);
    setToolN((n) => n + 1);
    setMode('tool');
  };
  const setLine = (line) => {
    const next = { ...itemRef.current, draft: { ...itemRef.current.draft, importantLine: line } };
    itemRef.current = next;
    setItem(next);
    save(next, 'completed').then((r) => toast.show(r.status === 'queued' ? 'Will sync' : 'Saved')).catch((error) => { if (!error?.superseded) toast.error(friendlyError(error, SAVE_ERROR)); });
  };
  const pdfDocument = async () => {
    const { healthCheckPdf } = await loadWithReload(() => import('../../lib/pdf/docs/healthCheck'));
    const now = itemRef.current;
    return healthCheckPdf({ draft: now.draft, completedAt: now.draft.completedAt || now.date, updatedAt: now.row?.updated_at || null, organisation: t.name });
  };
  const teamRows = store.rows.filter((r) => teamOf([t], r.id) || r.id === item.id);
  const deleteNow = (what) => {
    const which = what === 'team' ? teamRows : store.rows.filter((r) => r.id === item.id);
    remove(which, () => { forget(); navigate(BASE, { replace: true }); });
  };

  return (
    <Frame
      back
      foot={<BottomBar><Button variant="primary" onClick={() => setPanel('pdf')}>Download my PDF</Button></BottomBar>}
    >
      <PageHeader
        title={TITLE}
        aside={<TitleIcons><PlayButton label="Quick guide" onClick={() => setPanel('guide')} />{eye}</TitleIcons>}
        meta={[t.name, versionDate(item.date)]}
      />
      <HealthCheckResults
        draft={item.draft}
        // The Timing question counts from the version's own day (M7's d.ym).
        asOf={item.date}
        sort={sort}
        onSort={setSort}
        onLine={setLine}
        onEdit={openEdit}
        onEditProject={(pid) => openEdit({ project: pid })}
      />
      <ResultsSection row title="Versions" className="hc-in-versions">
        <div className="hc-keep">
          <p>Start a new version from a copy of your latest answers, and change only what has moved.</p>
          {t.draft
            ? <Button variant="outline" onClick={() => navigate(`${BASE}/version/${t.draft.id}`)}>Carry on with my new version</Button>
            : <Button variant="outline" onClick={() => navigate(`${BASE}/new?team=${encodeURIComponent(t.id)}`)}>Start a new version</Button>}
        </div>
        {t.versions.length > 1 && (
          <div className="hc-keep hc-in-compare">
            <p>See how your projects have moved since an earlier version.</p>
            <Button variant="outline" onClick={() => navigate(`${BASE}/compare?team=${encodeURIComponent(t.id)}`)}>Compare two versions</Button>
          </div>
        )}
      </ResultsSection>
      {/* M7 draws no delete: the portal's quiet Delete, inside the opened item (Tim, 5 Nov). */}
      {/* Deleted straight away, with "Deleted" and Undo: no "Delete this?" (writing rule 14; Phase 8a follow-up, step 2). */}
      <div className="hc-in-delete no-print">
        <Button variant="text" onClick={() => deleteNow('version')}>Delete this version</Button>
        {teamRows.length > 1 && <Button variant="text" onClick={() => deleteNow('team')}>Delete this team</Button>}
      </div>
      <PdfPanel open={panel === 'pdf'} onClose={() => setPanel(null)} getDocument={pdfDocument} />
      <GuidePanel inside open={panel === 'guide'} onClose={() => setPanel(null)} onWatched={() => {}} />
    </Frame>
  );
}

// ------------------------------------------------------------ compare

function ComparePage({ store }) {
  const navigate = useNavigate();
  const location = useLocation();
  const startChat = useStartChat();
  const coach = useCoachName();
  const q = new URLSearchParams(location.search);
  const team = store.teams.find((t) => t.id === q.get('team')) || null;
  if (!team || team.versions.length < 2) return <Navigate to={BASE} replace />;
  const byId = (id) => team.versions.find((v) => v.id === id);
  const b0 = byId(q.get('b')) || team.versions[0];
  // An address naming one version twice compares it with another (the break-it tester, 15 Nov).
  const a0 = (q.get('a') !== b0.id && byId(q.get('a'))) || team.versions.find((v) => v.id !== b0.id);
  const model = compareVersions(a0, b0);
  // Choosing a later version that's older than the earlier swaps the two (M7).
  // Choosing the version the other drop-down shows swaps the two, so a
  // version is never compared with itself (the functionality tester, 15 Nov).
  const pick = (which, id) => {
    const other = which === 'a' ? model.later : model.earlier;
    const mine = which === 'a' ? model.earlier : model.later;
    const chosen = byId(id);
    if (!chosen) return;
    const swap = chosen.id === other.id;
    const a = which === 'a' ? chosen : (swap ? mine : model.earlier);
    const b = which === 'b' ? chosen : (swap ? mine : model.later);
    const m = compareVersions(a, b);
    navigate(`${BASE}/compare?team=${encodeURIComponent(team.id)}&a=${m.earlier.id}&b=${m.later.id}`, { replace: true });
  };
  return (
    <Frame back>
      <PageHeader title="Compare two versions" meta={[team.name]} />
      <HealthCheckCompare
        model={model}
        options={team.versions.map((v) => ({ value: v.id, label: versionLabel(v, team.versions) }))}
        onPick={pick}
        talk={startChat && coach ? <Button variant="text" onClick={startChat}>{`Talk it through with ${coach}`}</Button> : null}
      />
    </Frame>
  );
}
