import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AddButton, Button, IconButton, InlineChoice, Loading, PageHeader, SearchField, useIsPhone, useToast } from '../../components/design';
import { useToastAbove } from '../../components/design/toastAbove';
import { deviceKey, readJson, writeJson } from '../../lib/deviceStore';
import { keyOf, newId, removeRow, rowsOf, saveRow } from '../../lib/coach/store';
import { moveClient } from '../../lib/coach/actions';
import {
  dayWords, engagementLine, fieldFromTyped, fieldValue, fieldWords, filterClients, filterCount, likelyDuplicates,
  listFromView, sortClients, sortOptions, stageBeside, stageLabel, stageMove, STAGES, workshopCounts,
} from '../../lib/coach/model';
import { EditCell, MenuItem, MenuLabel, PopMenu, Row, TextLink, useCoachPortal, useNarrowerThan } from './parts';
import { useClientRows } from './clientData';
import { AddClientPanel, AddGroupPanel, AddTeamPanel, AddWorkshopPanel, ExportPanel, FilterPanel, MergePanel } from './ClientPanels';
import { FieldPanel } from './Settings';
import { UnderTabs } from './todoParts';
import RenewalsTab from './Renewals';
import './leftovers.css';
import { countFigure, countWords } from '../../lib/coach/numbers';

// Clients (M11, version 3.6): people as a list, a board or a table (a
// phone offers the list and the board), with groups and workshops beside
// them as tabs. Sort, filter by anything, saved views, choosing several
// (Tag, or Move to a coach, with Undo), Add client, Add team, merge and
// export. Past clients sit behind a quiet link at the bottom.

const TABS = [{ value: 'people', label: 'People' }, { value: 'groups', label: 'Groups' }, { value: 'workshops', label: 'Workshops' }];
// Renewals (Phase 6b run 2; M11 C11) is the owner's alone: an associate has no Renewals tab.
const OWNER_TABS = [...TABS, { value: 'renewals', label: 'Renewals' }];
const LAYOUTS = [{ value: 'list', label: 'List' }, { value: 'board', label: 'Board' }, { value: 'table', label: 'Table' }];
const EMPTY_FILTERS = { tag: [], status: [], organisation: null, coach: null, fields: {} };
const START = { layout: 'list', sort: 'next', filters: EMPTY_FILTERS, hidden: [], viewId: null };
const SAVE_PROBLEM = 'That didn’t save. Check your connection and try again.';
const HOLD_MS = 450;
const DRAG_START = 6; // how far the mouse moves, in px, before a press becomes a drag

const BASE_COLUMNS = [
  { key: 'next', label: 'Next session', sorts: [['next', 'Soonest first']], date: true },
  { key: 'left', label: 'Sessions to go', sorts: [['left', 'Fewest first'], ['leftz', 'Most first']] },
  { key: 'last', label: 'Last contact', sorts: [['last', 'Longest ago first'], ['lastz', 'Most recent first']], date: true },
];

function fieldSorts(f) {
  if (f.kind === 'number') return [[`f:${f.id}`, 'Lowest first'], [`f:${f.id}:z`, 'Highest first']];
  if (f.kind === 'date') return [[`f:${f.id}`, 'Soonest first']];
  return [[`f:${f.id}`, 'A to Z']];
}

/** Every card on the board is one height, set by the fullest card (Tim, 18 Nov). */
export function useEvenCards(ref, deps) {
  useLayoutEffect(() => {
    const board = ref.current;
    if (!board) return undefined;
    const even = () => {
      const cards = [...board.querySelectorAll('.cc-card')];
      cards.forEach((c) => { c.style.minHeight = ''; });
      // Only cards in columns side by side are made one height; stacked in one column (a phone), each keeps its own (M11's phone).
      if (new Set(cards.map((c) => Math.round(c.getBoundingClientRect().left))).size < 2) return;
      const tallest = Math.max(0, ...cards.map((c) => c.getBoundingClientRect().height));
      cards.forEach((c) => { c.style.minHeight = `${tallest}px`; });
    };
    even();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const watch = new ResizeObserver(even);
    watch.observe(board);
    return () => watch.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** Whether the device's main pointer is a finger (a phone or a tablet): nothing is dragged there. */
export function useTouchFirst() {
  const query = '(pointer: coarse)';
  const [touch, setTouch] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const check = () => setTouch(media.matches);
    check();
    media.addEventListener('change', check);
    return () => media.removeEventListener('change', check);
  }, []);
  return touch;
}

export function PickTick({ on, name, onChange }) {
  return (
    <button type="button" className="cc-pick" role="checkbox" aria-checked={on} aria-label={`Select ${name}`} onClick={(e) => { e.stopPropagation(); onChange(!on); }}>
      <i><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg></i>
    </button>
  );
}

// A long list draws its first rows at once and the rest straight after (scale check, 22 Nov): switching List, Board and
// Table for the owner's 1,000 clients answered in 80 to 90 ms, close to the 100 ms a tap may take. The rows that
// follow come in the next moment, before anyone could scroll to them.
const FIRST_ROWS = 60;
function useGrowing(total, resetKey) {
  const [at, setAt] = useState({ key: resetKey, limit: FIRST_ROWS });
  if (at.key !== resetKey) setAt({ key: resetKey, limit: FIRST_ROWS });
  const limit = at.key === resetKey ? at.limit : FIRST_ROWS;
  useEffect(() => {
    if (limit >= total) return undefined;
    const later = window.setTimeout(() => setAt((was) => (was.key === resetKey ? { key: resetKey, limit: total } : was)), 0);
    return () => window.clearTimeout(later);
  }, [limit, total, resetKey]);
  return Math.min(limit, total);
}

export default function Clients() {
  const portal = useCoachPortal();
  const { userId, coach, isOwner, coaches, tags, fields, organisations, groups, workshops, views, state, todayKey, reloadCoaches, partial, adminReady } = portal;
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const isPhone = useIsPhone();
  const touchFirst = useTouchFirst();
  const [params, setParams] = useSearchParams();
  const tabs = isOwner ? OWNER_TABS : TABS;
  const tab = tabs.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'people';

  const listKey = deviceKey('cache', userId, 'coach-clients-list');
  const [list, setListState] = useState(() => ({ ...START, ...(readJson(listKey) || {}) }));
  const [q, setQ] = useState('');
  const setList = (next) => {
    if (next.apply) { applyView(next.apply); return; }
    setListState(next);
    writeJson(listKey, { layout: next.layout, sort: next.sort, filters: next.filters, hidden: next.hidden, viewId: next.viewId });
  };
  const applyView = (id) => {
    const view = views.find((v) => v.id === id);
    if (!view) return;
    const from = listFromView(view);
    const next = { layout: from.layout, sort: from.sort, filters: from.filters, hidden: from.columns, viewId: view.id };
    setListState(next);
    writeJson(listKey, next);
  };
  // A favourite view opened from the menu (?view=).
  const wanted = params.get('view');
  useEffect(() => {
    if (!wanted || !views.length) return;
    applyView(wanted);
    const rest = new URLSearchParams(params);
    rest.delete('view');
    setParams(rest, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, views.length]);

  const [panel, setPanel] = useState(location.state?.open || null);
  // An action chosen in search (Add client, Add team…) opens its panel once.
  useEffect(() => {
    if (location.state?.open) { setPanel(location.state.open); navigate(location.pathname + location.search, { replace: true, state: null }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state?.open]);
  const [field, setField] = useState(null);
  const [mergePair, setMergePair] = useState(null);

  const { rows, packs, entries, values } = useClientRows();
  const ctx = useMemo(() => ({ fields, values, packs, entries, tags, organisations, now: new Date() }), [fields, values, packs, entries, tags, organisations]);
  // The table needs a laptop's width; a tablet and a phone offer the list and the board.
  const noTable = useNarrowerThan(1100);
  const layout = noTable && list.layout === 'table' ? 'list' : list.layout;
  const shown = useMemo(() => sortClients(filterClients(rows, { ...list.filters, q }, ctx), list.sort, ctx), [rows, list.filters, list.sort, q, ctx]);
  const sorts = sortOptions(fields);
  const sortLabel = sorts.find((s) => s.value === list.sort)?.label || sorts[0].label;
  const orgName = (id) => organisations.find((o) => o.id === id)?.name || '';
  const filtersOn = filterCount(list.filters);
  const viewName = views.find((v) => v.id === list.viewId)?.name || null;

  // ---- choosing several
  const [picked, setPicked] = useState({});
  const pickedRows = rows.filter((r) => picked[r.profile.id]);
  const picking = pickedRows.length > 0;
  // While choosing, toasts ("Tagged", "Moved") rise above the bar, never over its buttons (tidy pass item 2).
  const bulkRef = useRef(null);
  useToastAbove(bulkRef, picking);
  const pick = (id, on) => setPicked((p) => { const n = { ...p }; if (on) n[id] = true; else delete n[id]; return n; });
  const hold = useRef(null);
  const holdStart = (id) => { if (!isPhone) return; clearTimeout(hold.current); hold.current = setTimeout(() => { hold.current = 'held'; pick(id, true); }, HOLD_MS); };
  const holdEnd = () => { if (hold.current !== 'held') clearTimeout(hold.current); };
  const open = (r) => {
    if (hold.current === 'held') { hold.current = null; return; }
    if (picking && isPhone) { pick(r.profile.id, !picked[r.profile.id]); return; }
    if (r.admin) { toast.show(`${r.profile.name} is ${r.coachName}’s client, so only ${r.coachName} opens their page.`); return; }
    navigate(`/coach/clients/${r.profile.id}`);
  };
  useEffect(() => { const onKey = (e) => { if (e.key === 'Escape' && picking) setPicked({}); }; document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey); }, [picking]);

  const [menu, setMenu] = useState(null); // 'sort' | 'tag' | 'move' | 'view' | `col:<key>`
  const anchors = useRef({});
  const anchor = (key) => ({ current: anchors.current[key] || null });
  const ref = (key) => (el) => { anchors.current[key] = el; };

  const tagPicked = async (tag) => {
    setMenu(null);
    const own = pickedRows.filter((r) => !r.admin);
    const links = rowsOf(state, 'coach_tag_links');
    const add = own.filter((r) => !links.some((l) => l.tag_id === tag.id && l.item_kind === 'client' && l.item_id === r.profile.id))
      .map((r) => ({ tag_id: tag.id, item_kind: 'client', item_id: r.profile.id, coach_id: coach.id }));
    try {
      for (const row of add) await saveRow(userId, 'coach_tag_links', row);
      toast.saved({ message: `${tag.name} added to ${countWords(own.length, 'client')}`, long: true, onUndo: async () => { for (const row of add) await removeRow(userId, 'coach_tag_links', keyOf('coach_tag_links', row)).catch(() => {}); } });
      setPicked({});
    } catch (error) { toast.error(error?.message || SAVE_PROBLEM); }
  };
  const movePicked = async (to) => {
    setMenu(null);
    const moving = pickedRows.filter((r) => r.profile.coach_id !== to.coach_id);
    if (!moving.length) { setPicked({}); return; }
    try {
      const from = [];
      for (const r of moving) from.push([r.profile.id, await moveClient(userId, r.profile.id, to.coach_id)]);
      reloadCoaches();
      toast.saved({ message: `${countWords(moving.length, 'client')} moved to ${to.coach_id === coach.id ? 'you' : to.first_name}`, long: true, onUndo: async () => { for (const [id, back] of from) await moveClient(userId, id, back).catch(() => {}); reloadCoaches(); } });
      setPicked({});
    } catch (error) { toast.error(error?.message || SAVE_PROBLEM); }
  };

  // ---- duplicates: one quiet line, never a pop-up
  const dismissedKey = deviceKey('cache', userId, 'coach-not-duplicates');
  const [dismissed, setDismissed] = useState(() => readJson(dismissedKey) || []);
  const pairKey = (a, b) => [a.id, b.id].sort().join('|');
  const duplicates = useMemo(() => likelyDuplicates(rows.filter((r) => !r.admin).map((r) => r.profile)).filter(([a, b]) => !dismissed.includes(pairKey(a, b))), [rows, dismissed]);
  const notDuplicates = ([a, b]) => { const next = [...dismissed, pairKey(a, b)].slice(-200); setDismissed(next); writeJson(dismissedKey, next); };

  // ---- the table's columns
  const columns = [...BASE_COLUMNS, ...fields.map((f) => ({ key: `f:${f.id}`, label: f.name, field: f, sorts: fieldSorts(f) }))];
  const visible = columns.filter((c) => !list.hidden.includes(c.key));
  const saveField = (profile, f, typed) => {
    const row = fieldFromTyped(f, typed);
    if (row === undefined) { toast.show(f.kind === 'number' ? 'Type a number to carry on.' : f.kind === 'date' ? 'Choose a day to carry on.' : 'Choose one from the list to carry on.'); return false; }
    const key = { field_id: f.id, item_id: profile.id };
    const before = values.find((v) => v.field_id === f.id && v.item_id === profile.id) || null;
    const work = row === null ? removeRow(userId, 'coach_field_values', keyOf('coach_field_values', key)).then(() => 'saved')
      : saveRow(userId, 'coach_field_values', { ...key, coach_id: coach.id, value_text: null, value_number: null, value_date: null, ...row });
    work.then((status) => toast.saved({ message: status === 'queued' ? 'Will sync' : 'Saved', long: true, onUndo: () => (before ? saveRow(userId, 'coach_field_values', before) : removeRow(userId, 'coach_field_values', keyOf('coach_field_values', key))) }))
      .catch((error) => toast.error(error?.message || SAVE_PROBLEM));
    return true;
  };
  const columnFilter = (c) => {
    if (!c.field || (c.field.kind !== 'choice' && c.field.kind !== 'text')) return [];
    const all = c.field.kind === 'choice' ? c.field.options || [] : [...new Set(values.filter((v) => v.field_id === c.field.id).map((v) => String(v.value_text ?? v.value_number ?? v.value_date ?? '')).filter(Boolean))].sort().slice(0, 20);
    return [...all, 'none'];
  };
  const toggleColumnFilter = (c, value) => {
    const now = list.filters.fields?.[c.field.id] || [];
    setList({ ...list, viewId: null, filters: { ...list.filters, fields: { ...(list.filters.fields || {}), [c.field.id]: now.includes(value) ? now.filter((x) => x !== value) : [...now, value] } } });
  };

  const drawn = useGrowing(shown.length, `${tab}:${layout}`);
  const shownNow = drawn < shown.length ? shown.slice(0, drawn) : shown;
  const boardRef = useRef(null);
  useEvenCards(boardRef, [layout, shownNow.length, shownNow.map((r) => r.profile.name).join('|')]);

  // ---- the board: a card moves to another column (Phase 6a run 2). With a
  // mouse it is dragged; with the keyboard a focused card moves left and
  // right with the arrow keys; on a phone or a tablet its More menu has
  // "Move to…".
  const [drag, setDrag] = useState(null); // { row, over, dx, dy, rect }
  const dragging = useRef(null);
  const dragged = useRef(false);
  const [moved, setMoved] = useState(''); // said to screen readers
  const focusCard = useRef(null);
  const moveTo = (r, to, { keepFocus = false } = {}) => {
    if (!to || r.stage === to) return;
    if (r.admin) { toast.show(`${r.profile.name} is ${r.coachName}’s client, so only ${r.coachName} moves them.`); return; }
    const before = r.profile;
    const change = stageMove(before, to);
    if (!change) return;
    const label = stageLabel(to);
    if (keepFocus) focusCard.current = before.id;
    saveRow(userId, 'client_profiles', { ...before, ...change })
      .then((status) => {
        setMoved(`Moved to ${label}.`);
        toast.saved({ message: status === 'queued' ? 'Will sync' : `Moved to ${label}`, long: true, onUndo: () => saveRow(userId, 'client_profiles', before) });
      })
      .catch((error) => toast.error(error?.message || SAVE_PROBLEM));
  };
  // A card moved with the keyboard keeps the focus in its new column.
  useEffect(() => {
    if (!focusCard.current) return;
    const card = [...(boardRef.current?.querySelectorAll('[data-card]') || [])].find((el) => el.dataset.card === focusCard.current);
    if (card && document.activeElement !== card) card.focus();
    if (card) focusCard.current = null;
  });
  const stageUnder = (e) => document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-stage]')?.dataset.stage || null;
  const cardDown = (e, r) => {
    dragged.current = false;
    if (e.pointerType !== 'mouse' || e.button !== 0 || r.admin) return;
    dragging.current = { row: r, x: e.clientX, y: e.clientY, on: false, rect: e.currentTarget.closest('.cc-card').getBoundingClientRect() };
  };
  const cardMove = (e) => {
    const d = dragging.current;
    if (!d) return;
    if (!d.on) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < DRAG_START) return;
      d.on = true;
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    setDrag({ row: d.row, over: stageUnder(e), dx: e.clientX - d.x, dy: e.clientY - d.y, rect: d.rect });
  };
  const cardUp = (e) => {
    const d = dragging.current;
    dragging.current = null;
    if (!d?.on) return;
    dragged.current = true; // the click that follows a drag opens nothing
    setTimeout(() => { dragged.current = false; }, 80);
    setDrag(null);
    if (e.type === 'pointerup') moveTo(d.row, stageUnder(e));
  };
  useEffect(() => {
    if (!drag) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') { dragging.current = null; setDrag(null); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drag]);
  const cardKey = (e, r) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    moveTo(r, stageBeside(r.stage, e.key === 'ArrowLeft' ? -1 : 1), { keepFocus: true });
  };
  const cardWords = (r) => (
    <>
      <b>{r.profile.name}</b>
      <small>{orgName(r.profile.organisation_id) || (r.admin ? `${r.coachName}’s client` : 'Self-funded')}</small>
      <span>{when(r)}</span>
      <span>{engagementLine(r.engagement, packs, entries, ctx.now, { toGo: true }) || 'No engagement yet'}</span>
    </>
  );
  const menuRow = menu?.startsWith('card:') ? shown.find((r) => r.profile.id === menu.slice(5)) || null : null;

  const when = (r) => (r.nextAt ? dayWords(r.nextAt.slice(0, 10), todayKey) : 'Not booked');
  const facts = (r) => [orgName(r.profile.organisation_id) || (r.admin ? null : 'Self-funded'), r.profile.city, r.admin ? `${r.coachName}’s client` : null, !r.admin && !r.profile.user_id && !r.profile.invited_at ? 'No account yet' : null];

  const people = (
    <>
      {!isPhone && <div className="cc-search-field"><SearchField label="Search clients" placeholder="Search clients" value={q} onChange={setQ} /></div>}
      <div className="cc-toolbar">
        {!isPhone && <div className="cc-seg"><InlineChoice ariaLabel="Layout" semantics="pressed" options={noTable ? LAYOUTS.slice(0, 2) : LAYOUTS} value={layout} onChange={(v) => setList({ ...list, layout: v })} form="pills" /></div>}
        {isPhone && <TextLink ref={ref('view')} aria-haspopup="menu" aria-expanded={menu === 'view'} onClick={() => setMenu('view')}>View</TextLink>}
        {isPhone ? <TextLink onClick={() => setPanel('filter')}>{filtersOn ? `Filter, ${filtersOn} on` : 'Filter'}</TextLink> : <Button variant="outline" onClick={() => setPanel('filter')}>{filtersOn ? `Filter, ${filtersOn} on` : 'Filter'}</Button>}
        {!isPhone && <TextLink onClick={() => setPanel('export')}>Export</TextLink>}
        {!isPhone && <TextLink ref={ref('sort')} aria-haspopup="menu" aria-expanded={menu === 'sort'} onClick={() => setMenu('sort')}>{sortLabel}</TextLink>}
        <span className="cc-toolbar-who">{viewName || (isOwner && coaches.length > 1 ? 'Everyone' : 'Your clients')}</span>
      </div>
      {isPhone && <div className="cc-search-field"><SearchField label="Search clients" placeholder="Search clients" value={q} onChange={setQ} /></div>}
      {(filtersOn > 0 || viewName) && (
        <p className="cc-quiet">
          {countFigure(shown.length)} of {countWords(rows.length, 'client')}. <TextLink onClick={() => setList({ ...list, filters: EMPTY_FILTERS, viewId: null })}>Clear</TextLink>
        </p>
      )}
      {duplicates.length > 0 && (
        <p className="cc-quiet">
          {duplicates[0][0].name} and {duplicates[0][1].name} look like the same person. <TextLink onClick={() => setMergePair(duplicates[0])}>Merge them</TextLink>
        </p>
      )}

      <PopMenu open={menu === 'sort'} onClose={() => setMenu(null)} anchorRef={anchor('sort')} title="Sort">
        {sorts.map((s) => <MenuItem key={s.value} checked={list.sort === s.value} onClick={() => { setList({ ...list, sort: s.value, viewId: null }); setMenu(null); }}>{s.label}</MenuItem>)}
      </PopMenu>
      <PopMenu open={menu === 'view'} onClose={() => setMenu(null)} anchorRef={anchor('view')} title="View">
        <MenuLabel>Show as</MenuLabel>
        {LAYOUTS.slice(0, 2).map((l) => <MenuItem key={l.value} checked={layout === l.value} onClick={() => { setList({ ...list, layout: l.value }); setMenu(null); }}>{l.label}</MenuItem>)}
        <MenuLabel>Sort</MenuLabel>
        {sorts.map((s) => <MenuItem key={s.value} checked={list.sort === s.value} onClick={() => { setList({ ...list, sort: s.value, viewId: null }); setMenu(null); }}>{s.label}</MenuItem>)}
      </PopMenu>

      {rows.length === 0 && (
        <p className="cc-quiet">You have no clients here yet. Add one, or a whole team from a spreadsheet.</p>
      )}
      {rows.length > 0 && shown.length === 0 && <p className="cc-quiet">Nobody matches. Clear the search or the filters to see everyone.</p>}

      {layout === 'list' && shown.length > 0 && (
        <div className={`cc-rows cc-fade${picking ? ' cc-picking' : ''}`} key="list">
          {shownNow.map((r) => (
            <div key={r.profile.id} className={`cc-pick-row${picked[r.profile.id] ? ' cc-pick-row--on' : ''}`} onPointerDown={() => holdStart(r.profile.id)} onPointerUp={holdEnd} onPointerLeave={holdEnd} onPointerCancel={holdEnd}>
              <PickTick on={Boolean(picked[r.profile.id])} name={r.profile.name} onChange={(on) => pick(r.profile.id, on)} />
              <Row title={r.profile.name} facts={facts(r)} when={when(r)} onClick={() => open(r)} />
            </div>
          ))}
        </div>
      )}

      {layout === 'board' && shown.length > 0 && (
        <div className={`cc-board cc-fade${drag ? ' cc-board--dragging' : ''}`} ref={boardRef} key="board">
          {STAGES.map((s) => {
            const here = shown.filter((r) => r.stage === s.value);
            const cards = drawn < shown.length ? shownNow.filter((r) => r.stage === s.value) : here;
            return (
              <section key={s.value} className={`cc-board-col${drag && drag.over === s.value && drag.row.stage !== s.value ? ' cc-board-col--over' : ''}`} data-stage={s.value} aria-label={`${s.label}, ${here.length}`}>
                <div className="cc-board-head"><span>{s.label}</span><span>{countFigure(here.length)}</span></div>
                <div className="cc-board-cards">
                  {cards.map((r) => (
                    <div key={r.profile.id} className={`cc-card${drag?.row.profile.id === r.profile.id ? ' cc-card--lifted' : ''}${(isPhone || touchFirst) && !r.admin ? ' cc-card--more' : ''}`}>
                      <button
                        type="button"
                        className="cc-card-open"
                        data-card={r.profile.id}
                        aria-roledescription={r.admin ? undefined : 'Card that can be moved to another column'}
                        onClick={() => { if (!dragged.current) open(r); }}
                        onKeyDown={(e) => cardKey(e, r)}
                        onPointerDown={(e) => cardDown(e, r)}
                        onPointerMove={cardMove}
                        onPointerUp={cardUp}
                        onPointerCancel={cardUp}
                      >
                        {cardWords(r)}
                      </button>
                      {(isPhone || touchFirst) && !r.admin && (
                        <TextLink className="cc-card-move" ref={ref(`card:${r.profile.id}`)} aria-haspopup="menu" aria-expanded={menu === `card:${r.profile.id}`} aria-label={`More for ${r.profile.name}`} onClick={() => setMenu(`card:${r.profile.id}`)}>More</TextLink>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
          <span className="ds-sr" role="status" aria-live="polite">{moved}</span>
        </div>
      )}
      {drag && (
        <div className="cc-card cc-card-ghost" aria-hidden="true" style={{ left: drag.rect.left, top: drag.rect.top, width: drag.rect.width, minHeight: drag.rect.height, transform: `translate(${drag.dx}px, ${drag.dy}px)` }}>
          <div className="cc-card-open">{cardWords(drag.row)}</div>
        </div>
      )}
      <PopMenu open={Boolean(menuRow)} onClose={() => setMenu(null)} anchorRef={anchor(menu || '')} title="More">
        <MenuLabel>Move to…</MenuLabel>
        {menuRow && STAGES.map((st) => <MenuItem key={st.value} checked={menuRow.stage === st.value} onClick={() => { setMenu(null); moveTo(menuRow, st.value); }}>{st.label}</MenuItem>)}
      </PopMenu>

      {layout === 'table' && shown.length > 0 && (
        <div className={`cc-table-wrap cc-fade${picking ? ' cc-picking' : ''}`} key="table">
          <table className="cc-table">
            <thead>
              <tr>
                <th scope="col"><button type="button" className={`cc-th${list.sort.startsWith('name') ? ' cc-th--on' : ''}`} ref={ref('col:name')} aria-haspopup="menu" aria-expanded={menu === 'col:name'} onClick={() => setMenu('col:name')}>Name</button></th>
                {visible.map((c) => (
                  <th key={c.key} scope="col" className={c.date || c.field?.kind === 'date' ? 'cc-th-date' : undefined}><button type="button" className={`cc-th${c.sorts.some(([v]) => v === list.sort) || (c.field && (list.filters.fields?.[c.field.id] || []).length) ? ' cc-th--on' : ''}`} ref={ref(`col:${c.key}`)} aria-haspopup="menu" aria-expanded={menu === `col:${c.key}`} onClick={() => setMenu(`col:${c.key}`)}>{c.label}</button></th>
                ))}
                <th scope="col" className="cc-th-add"><button type="button" className="cc-round" aria-label="Add field" onClick={() => setField({ id: newId(), name: '', kind: 'text', optionsText: '' })}><span className="ds-addrow-mark" aria-hidden="true" /></button></th>
              </tr>
            </thead>
            <tbody>
              {shownNow.map((r) => (
                <tr key={r.profile.id} className={`cc-pick-row${picked[r.profile.id] ? ' cc-pick-row--on' : ''}`}>
                  <td>
                    <PickTick on={Boolean(picked[r.profile.id])} name={r.profile.name} onChange={(on) => pick(r.profile.id, on)} />
                    <button type="button" className="cc-table-name" onClick={() => open(r)}>{r.profile.name}</button>
                    <small>{orgName(r.profile.organisation_id) || (r.admin ? `${r.coachName}’s client` : 'Self-funded')}</small>
                  </td>
                  {visible.map((c) => {
                    if (c.key === 'next') return <td key={c.key}>{when(r)}</td>;
                    if (c.key === 'left') return <td key={c.key}>{engagementLine(r.engagement, packs, entries, ctx.now)}</td>;
                    if (c.key === 'last') return <td key={c.key}>{r.profile.last_contact_on ? dayWords(r.profile.last_contact_on, todayKey) : ''}</td>;
                    if (r.admin) return <td key={c.key} />;
                    const v = fieldValue(c.field, values, r.profile.id);
                    return <td key={c.key}><EditCell label={c.label} value={v} words={fieldWords(c.field, v, todayKey)} kind={c.field.kind} options={c.field.options || []} onSave={(typed) => saveField(r.profile, c.field, typed)} /></td>;
                  })}
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
          <PopMenu open={menu === 'col:name'} onClose={() => setMenu(null)} anchorRef={anchor('col:name')} title="Name">
            <MenuLabel>Sort</MenuLabel>
            <MenuItem checked={list.sort === 'name'} onClick={() => { setList({ ...list, sort: 'name', viewId: null }); setMenu(null); }}>A to Z</MenuItem>
            <MenuItem checked={list.sort === 'namez'} onClick={() => { setList({ ...list, sort: 'namez', viewId: null }); setMenu(null); }}>Z to A</MenuItem>
            {list.hidden.length > 0 && <MenuLabel>Hidden columns</MenuLabel>}
            {columns.filter((c) => list.hidden.includes(c.key)).map((c) => <MenuItem key={c.key} onClick={() => { setList({ ...list, hidden: list.hidden.filter((k) => k !== c.key), viewId: null }); setMenu(null); }}>Show {c.label}</MenuItem>)}
          </PopMenu>
          {visible.map((c) => (
            <PopMenu key={c.key} open={menu === `col:${c.key}`} onClose={() => setMenu(null)} anchorRef={anchor(`col:${c.key}`)} title={c.label}>
              <MenuLabel>Sort</MenuLabel>
              {c.sorts.map(([value, label]) => <MenuItem key={value} checked={list.sort === value} onClick={() => { setList({ ...list, sort: value, viewId: null }); setMenu(null); }}>{label}</MenuItem>)}
              {columnFilter(c).length > 1 && <MenuLabel>Show only</MenuLabel>}
              {columnFilter(c).length > 1 && columnFilter(c).map((value) => <MenuItem key={value} checked={(list.filters.fields?.[c.field.id] || []).includes(value)} onClick={() => toggleColumnFilter(c, value)}>{value === 'none' ? 'Not set' : value}</MenuItem>)}
              <MenuLabel>Column</MenuLabel>
              <MenuItem onClick={() => { setList({ ...list, hidden: [...list.hidden, c.key], viewId: null }); setMenu(null); }}>Hide this column</MenuItem>
            </PopMenu>
          ))}
        </div>
      )}

      <div className="cc-add"><AddButton onClick={() => setPanel('add')}>Add client</AddButton></div>
      <div className="cc-acts">
        <TextLink onClick={() => setPanel('team')}>Add team</TextLink>
        {isPhone && <TextLink onClick={() => setPanel('export')}>Export</TextLink>}
        <TextLink onClick={() => navigate('/coach/clients/past')}>Past clients</TextLink>
      </div>

      {picking && (
        <div ref={bulkRef} className="cc-bulk" role="toolbar" aria-label={`${countFigure(pickedRows.length)} chosen`}>
          <span className="cc-bulk-n" aria-live="polite">{countFigure(pickedRows.length)} chosen</span>
          {tags.length > 0 && pickedRows.some((r) => !r.admin) && <button type="button" className="cc-bulk-btn" ref={ref('tag')} aria-haspopup="menu" aria-expanded={menu === 'tag'} onClick={() => setMenu('tag')}>Tag</button>}
          {isOwner && coaches.filter((c) => c.active).length > 1 && <button type="button" className="cc-bulk-btn" ref={ref('move')} aria-haspopup="menu" aria-expanded={menu === 'move'} onClick={() => setMenu('move')}>Move</button>}
          {pickedRows.length === 2 && pickedRows.every((r) => !r.admin) && <button type="button" className="cc-bulk-btn" onClick={() => { setMergePair([pickedRows[0].profile, pickedRows[1].profile]); setPicked({}); }}>Merge</button>}
          <IconButton label="Stop choosing" onClick={() => setPicked({})} />
          <PopMenu open={menu === 'tag'} onClose={() => setMenu(null)} anchorRef={anchor('tag')} title="Tag">
            {tags.map((t) => <MenuItem key={t.id} onClick={() => tagPicked(t)}>{t.name}</MenuItem>)}
          </PopMenu>
          <PopMenu open={menu === 'move'} onClose={() => setMenu(null)} anchorRef={anchor('move')} title="Move to a coach">
            {coaches.filter((c) => c.active).map((c) => <MenuItem key={c.coach_id} onClick={() => movePicked(c)}>{c.coach_id === coach.id ? 'To you' : `To ${c.full_name || c.first_name}`}</MenuItem>)}
          </PopMenu>
        </div>
      )}
    </>
  );

  const wide = tab === 'people' && layout !== 'list';
  return (
    <div className="cc-page">
      <div className={`cc-col${wide ? ' cc-col--wide' : ''}`}>
        <PageHeader title="Clients" />
        {/* Underlined tabs move between parts of a page; the gliding switch only changes how the same thing is shown (Tim, 18 Nov). */}
        <div className="cc-tabs"><UnderTabs label="Clients" tabs={tabs} value={tab} onChange={(v) => setParams(v === 'people' ? {} : { tab: v }, { replace: true })} /></div>
        {/* The owner's list holds every coach's clients: until that list is here (a first visit) it says it's loading,
            never the owner's own clients alone with their count (coach first screen run). */}
        {tab === 'people' && (adminReady ? people : <Loading label="Loading your clients" />)}
        {tab === 'groups' && (
          <>
            {groups.length === 0 && <p className="cc-quiet">You have no groups yet. A group is a team you coach together.</p>}
            <div className="cc-rows cc-fade">
              {[...groups].sort((a, b) => a.name.localeCompare(b.name)).map((g) => {
                const n = rowsOf(state, 'coach_group_members').filter((m) => m.group_id === g.id).length;
                return <Row key={g.id} title={g.name} facts={[orgName(g.organisation_id), `${n} ${n === 1 ? 'person' : 'people'}`]} when="" onClick={() => navigate(`/coach/groups/${g.id}`)} />;
              })}
            </div>
            <div className="cc-add"><AddButton onClick={() => setPanel('group')}>Add group</AddButton></div>
          </>
        )}
        {/* A first visit's first screen has no workshops: the tab waits for the rest. */}
        {tab === 'renewals' && <RenewalsTab />}
        {tab === 'workshops' && partial && <Loading label="Loading your workshops" />}
        {tab === 'workshops' && !partial && (
          <>
            {workshops.length === 0 && <p className="cc-quiet">You have no workshops yet.</p>}
            <div className="cc-rows cc-fade">
              {[...workshops].sort((a, b) => String(b.starts_at || '').localeCompare(String(a.starts_at || ''))).map((w) => {
                const c = workshopCounts(rowsOf(state, 'workshop_attendees').filter((a) => a.workshop_id === w.id), w.capacity);
                return <Row key={w.id} title={w.title} facts={[orgName(w.organisation_id), `${c.registered} of ${w.capacity} places`, c.waiting ? `${c.waiting} waiting` : null]} when={w.starts_at ? dayWords(w.starts_at.slice(0, 10), todayKey) : ''} onClick={() => navigate(`/coach/workshops/${w.id}`)} />;
              })}
            </div>
            <div className="cc-add"><AddButton onClick={() => setPanel('workshop')}>Add workshop</AddButton></div>
          </>
        )}
      </div>
      <AddClientPanel open={panel === 'add'} onClose={() => setPanel(null)} onAdded={(id, mine) => { if (mine) navigate(`/coach/clients/${id}`); else reloadCoaches(); }} />
      <AddTeamPanel open={panel === 'team'} onClose={() => setPanel(null)} />
      <ExportPanel open={panel === 'export'} onClose={() => setPanel(null)} shown={shown} all={rows} ctx={ctx} />
      <FilterPanel open={panel === 'filter'} onClose={() => setPanel(null)} list={list} setList={setList} count={shown.length} />
      <AddGroupPanel open={panel === 'group'} onClose={() => setPanel(null)} onAdded={(id) => navigate(`/coach/groups/${id}`)} />
      <AddWorkshopPanel open={panel === 'workshop'} onClose={() => setPanel(null)} onAdded={(id) => navigate(`/coach/workshops/${id}`)} />
      <MergePanel pair={mergePair} onClose={() => setMergePair(null)} onDifferent={notDuplicates} />
      <FieldPanel draft={field} setDraft={setField} />
    </div>
  );
}
