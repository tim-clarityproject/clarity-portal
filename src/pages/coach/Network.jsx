import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useToast } from '../../components/design';
import { AddLink, Card, Empty, PageOpening, SectionTabs } from '../../components/design/Blocks';
import { PEOPLE } from '../../content/pageLines/coach';
import { saveRow } from '../../lib/coach/store';
import { networkPageOf } from '../../lib/coach/networkData';
import {
  ACTIONS_WORDS, actionRow, COMING_FOLD, comingUpQuery, DUE_FOLD, dueNowQuery, folded, moreWords, NETWORK_LOAD_PROBLEM, NETWORK_TABS, networkPath, networkProblem, READY_BUTTONS, READY_NOT_NOW, readyCardLine,
  showReadyCard, TABLE_START, withArchiveNotNow,
} from '../../lib/coach/network';
import { TextLink, useCoachPortal } from './parts';
import { PersonRow } from './peopleParts';
import { useNetworkAsk, useNetworkCounts } from './networkParts';
import { AddPersonPanel, ColumnsPanel, ExportPanel, ImportPanel, PersonPanel, ReadyPanel } from './NetworkPanels';
import NetworkTable from './NetworkTable';
import NetworkMap from './NetworkMap';
import './leftovers.css';
import './leads.css';
import './network.css';

// Network (M11 seq 77; handover of 19 Nov): everyone the owner is keeping
// warm, on three underlined tabs, Actions first. Actions: who is due a
// catch-up now (most overdue first, folding after 8) and who is coming up
// (soonest first, folding after 4), Add someone, and one quiet card when
// people are ready to archive. Table: the spreadsheet. Map: Where to
// focus. A person opens in the side panel from any of them. Network is the
// owner's alone, and its people are never loaded whole: each part asks
// networkData.js for a page, the map's 150 or the counts. Every rule and
// word is network.js's.

/** One folded list of Actions: its first few, "Show all 27", then on in pages. */
function ActionList({ title, query, fold, empty, onOpen, add }) {
  const { userId, todayKey } = useCoachPortal();
  const [all, setAll] = useState(false);
  const [extra, setExtra] = useState([]); // the pages after the first, once Show all has more than one
  const first = useNetworkAsk(() => networkPageOf(userId, query(todayKey, { all })), [userId, todayKey, all]);
  useEffect(() => { setExtra([]); }, [first.data]);
  const busy = useRef(false);
  if (!first.data) return first.error ? <Card label={title} add={add}><p className="cc-problem" role="alert">{first.error.code === 'OFFLINE' || first.error.code === 'NO_ROOM' ? networkProblem(first.error) : NETWORK_LOAD_PROBLEM}</p></Card> : null;
  const rows = [...first.data.rows, ...extra];
  const list = folded(rows, first.data.total, fold, all);
  const more = all ? moreWords(rows.length, first.data.total) : '';
  const next = async () => {
    if (busy.current) return;
    busy.current = true;
    try { const page = await networkPageOf(userId, query(todayKey, { all: true, offset: rows.length })); setExtra((e) => [...e, ...page.rows]); } catch { /* the link stays, to try again */ } finally { busy.current = false; }
  };
  return (
    <Card label={title} add={add}>
      {rows.length === 0 && <Empty>{empty}</Empty>}
      {rows.length > 0 && (
        <div className="ds-rows-list">
          {list.rows.map((p) => { const r = actionRow(p, todayKey); return <PersonRow key={r.id} name={r.name} facts={[r.role, r.rhythm]} when={r.when} href={networkPath({ tab: 'actions', person: r.id })} onClick={() => onOpen(r.id)} />; })}
        </div>
      )}
      {list.more && <div className="cc-acts"><TextLink aria-expanded="false" onClick={() => setAll(true)}>{list.more}</TextLink></div>}
      {more && <div className="cc-acts"><TextLink onClick={next}>{more}</TextLink></div>}
    </Card>
  );
}

export default function Network() {
  const { userId, isOwner, settings, todayKey } = useCoachPortal();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const counts = useNetworkCounts().data;
  const tab = NETWORK_TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'actions';
  const archived = tab === 'table' && params.get('archived') === '1';
  const personId = params.get('person');
  const [panel, setPanel] = useState(location.state?.open || null); // 'add' | 'ready' | 'import' | 'export' | 'columns' | 'addColumn'
  const [table, setTable] = useState({ state: { ...TABLE_START, archived: false }, total: 0 });
  // An action chosen in search (Add someone, Import…) opens its panel once.
  useEffect(() => {
    if (location.state?.open) { setPanel(location.state.open); navigate(location.pathname + location.search, { replace: true, state: null }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state?.open]);
  const onState = useCallback((state, total) => setTable((t) => (t.state === state && t.total === total ? t : { state, total })), []);
  if (!isOwner) return <Navigate to="/coach" replace />;

  const go = (next) => navigate(networkPath({ tab, archived, person: personId, ...next }), { replace: Boolean(next.replace) });
  const openPerson = (id) => setParams((p) => { const q = new URLSearchParams(p); q.set('person', id); return q; });
  const closePerson = () => setParams((p) => { const q = new URLSearchParams(p); q.delete('person'); return q; }, { replace: true });
  const notNow = () => {
    const before = settings.crm || {};
    const save = (crm) => saveRow(userId, 'coach_settings', { ...settings, crm }).catch((e) => toast.error(networkProblem(e)));
    save(withArchiveNotNow(before, todayKey));
    toast.saved({ message: READY_NOT_NOW, long: true, onUndo: () => save(before) });
  };
  const empty = counts && counts.active === 0;
  const addLink = <AddLink label={ACTIONS_WORDS.add} expanded={panel === 'add'} onClick={() => setPanel('add')} />;

  return (
    <div className="cc-page">
      <div className="cc-col cc-net cc-people">
        <PageOpening title={PEOPLE.networkTitle} line={PEOPLE.networkLine} />
        <SectionTabs label="Network" tabs={NETWORK_TABS.map(([key, label]) => ({ key, label }))} value={tab} onChange={(v) => go({ tab: v, archived: false, person: null })} className="cc-ptabs" />
        <div id="cc-net-panel" role="tabpanel" aria-label={NETWORK_TABS.find(([k]) => k === tab)?.[1]}>
          {tab === 'actions' && (
            <div className="cc-fade">
              {showReadyCard(counts, settings.crm, todayKey) && (
                <Card className="cc-net-card">
                  <p>{readyCardLine(counts.ready)}</p>
                  <div className="cc-acts">
                    <TextLink onClick={() => setPanel('ready')}>{READY_BUTTONS.review}</TextLink>
                    <TextLink onClick={notNow}>{READY_BUTTONS.notNow}</TextLink>
                  </div>
                </Card>
              )}
              {empty ? <Card label={ACTIONS_WORDS.dueNow} add={addLink}><Empty>{ACTIONS_WORDS.empty}</Empty></Card> : (
                <>
                  {/* "+ Add" by the first list's label (rule 10); adding someone needs their ratings, so it opens its panel. */}
                  <ActionList title={ACTIONS_WORDS.dueNow} query={dueNowQuery} fold={DUE_FOLD} empty={ACTIONS_WORDS.upToDate} onOpen={openPerson} add={addLink} />
                  <ActionList title={ACTIONS_WORDS.comingUp} query={comingUpQuery} fold={COMING_FOLD} empty={ACTIONS_WORDS.nothingComing} onOpen={openPerson} />
                </>
              )}
            </div>
          )}
          {tab === 'table' && <NetworkTable archived={archived} onArchive={(on) => go({ archived: on, person: null })} onOpen={openPerson} onPanel={setPanel} counts={counts} onState={onState} />}
          {tab === 'map' && <NetworkMap onOpen={openPerson} />}
        </div>
      </div>
      <PersonPanel id={personId} onClose={closePerson} />
      <AddPersonPanel open={panel === 'add'} onClose={() => setPanel(null)} />
      <ReadyPanel open={panel === 'ready'} onClose={() => setPanel(null)} />
      <ImportPanel open={panel === 'import'} onClose={() => setPanel(null)} />
      <ExportPanel open={panel === 'export'} onClose={() => setPanel(null)} state={table.state} counts={{ view: table.total, active: counts?.active || 0, archived: counts?.archived || 0 }} />
      <ColumnsPanel open={panel === 'columns' || panel === 'addColumn'} adding={panel === 'addColumn'} onClose={() => setPanel(null)} />
    </div>
  );
}
