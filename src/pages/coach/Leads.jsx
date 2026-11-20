import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AddButton, Button, IconButton, InlineChoice, PageHeader, SearchField, useIsPhone, useToast } from '../../components/design';
import { deviceKey, readJson, writeJson } from '../../lib/deviceStore';
import { keyOf, newId, removeRow, saveRow, saveRows } from '../../lib/coach/store';
import { fieldValue, fieldWords } from '../../lib/coach/model';
import {
  BOARD_FOLD, dismissWaiting, EMPTY_LEAD_FILTERS, headingWords, LEAD_LAYOUTS, LEAD_ROW_MENU, leadBoard, leadCard, leadCountWords, leadDuplicates, leadFilterCount, leadFromWaiting,
  leadListFromView, LEADS_EMPTY, LEADS_NO_MATCH, leadTableColumns, filterLeads, sortLeads, stageBesideLead, stageOf, WAITING_BUTTONS, WAITING_DISMISSED, waitingLine, waitingRows,
} from '../../lib/coach/crm';
import { EditCell, MenuItem, MenuLabel, Part, PopMenu, Row, TextLink, useCoachPortal, useNarrowerThan } from './parts';
import { PickTick, useEvenCards, useTouchFirst } from './Clients';
import { MORE, SAVE_PROBLEM, useLeadActions, useLeadData, useStartStages } from './leadParts';
import { AddLeadPanel, ColdPanel, EditLeadPanel, ExportLeadsPanel, ImportLeadsPanel, LeadFilterPanel, LogCallPanel, MergeLeadsPanel, StagesPanel } from './LeadPanels';
import { FieldPanel } from './Settings';
import './leftovers.css';
import './leads.css';

// Leads (M11 seq 77: "Leads, the CRM", "Leads as a list", "Leads as a
// table"): the owner's pipeline as a board, a list or a table behind the
// gliding view switch (the table at 1100px and wider). A card moves between
// stages by dragging, with the arrow keys, or from its More menu; a stage
// is chosen and a next step typed over in the table; every heading sorts
// and narrows. Won makes a client; Cold leads wait on their own page.
// Someone emailed who isn't in the portal waits here as one quiet line,
// and so does a pair who may be one person. Every rule and word is
// crm.js's. Reports (win rate, time to win) are Finances, in 6b.

const START = { layout: 'board', sort: 'next', filters: EMPTY_LEAD_FILTERS, hidden: [], viewId: null };
const HOLD_MS = 450;
const DRAG_START = 6; // how far the mouse moves, in px, before a press becomes a drag
const TABLE_FOLD = 100;
const FILTER_KEYS = { stage: 'stage', next: 'next', last: 'last', value: 'value' };

export default function Leads() {
  const portal = useCoachPortal();
  const { userId, coach, tags, leadFields, views, emails, emailWaiting, settings, todayKey } = portal;
  useStartStages();
  const data = useLeadData();
  const { stages, open, all, ctx, values } = data;
  const actions = useLeadActions();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const isPhone = useIsPhone();
  const touchFirst = useTouchFirst();
  const [params, setParams] = useSearchParams();

  const listKey = deviceKey('cache', userId, 'coach-leads-list');
  const [list, setListState] = useState(() => { const kept = readJson(listKey) || {}; return { ...START, ...kept, filters: { ...EMPTY_LEAD_FILTERS, ...(kept.filters || {}) } }; });
  const [q, setQ] = useState('');
  const applyView = (id) => {
    const view = views.find((v) => v.id === id && v.list === 'leads');
    if (!view) return;
    const next = { ...leadListFromView(view), viewId: view.id };
    setListState(next);
    writeJson(listKey, next);
  };
  const setList = (next) => {
    if (next.apply) { applyView(next.apply); return; }
    setListState(next);
    writeJson(listKey, { layout: next.layout, sort: next.sort, filters: next.filters, hidden: next.hidden, viewId: next.viewId });
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

  const [panel, setPanel] = useState(location.state?.open || null); // 'add' | 'import' | 'export' | 'filter' | 'stages'
  // An action chosen in search (Add lead, Import…) opens its panel once.
  useEffect(() => {
    if (location.state?.open) { setPanel(location.state.open); navigate(location.pathname + location.search, { replace: true, state: null }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state?.open]);
  const [editing, setEditing] = useState(null); // { kind: 'edit' | 'call' | 'cold', id }
  const [field, setField] = useState(null);
  const [mergePair, setMergePair] = useState(null);
  const leadOf = (id) => all.find((l) => l.id === id) || null;
  const editingLead = (kind) => (editing?.kind === kind ? open.find((l) => l.id === editing.id) || leadOf(editing.id) : null);

  // The table needs a laptop's width; a tablet and a phone offer the board and the list.
  const noTable = useNarrowerThan(1100);
  const layout = noTable && list.layout === 'table' ? 'board' : list.layout;
  const filtered = useMemo(() => filterLeads(open, { ...list.filters, q }, ctx), [open, list.filters, q, ctx]);
  const shown = useMemo(() => sortLeads(filtered, list.sort, ctx), [filtered, list.sort, ctx]);
  const board = useMemo(() => leadBoard(stages, filtered, ctx), [stages, filtered, ctx]);
  const filtersOn = leadFilterCount(list.filters);
  const narrowed = filtersOn > 0 || Boolean(q.trim());
  const viewName = views.find((v) => v.id === list.viewId)?.name || null;
  const [more, setMore] = useState({}); // a stage's id (or 'table') once "Show all" was pressed

  // ---- choosing several
  const [picked, setPicked] = useState({});
  const pickedLeads = open.filter((l) => picked[l.id]);
  const picking = pickedLeads.length > 0;
  const pick = (id, on) => setPicked((p) => { const n = { ...p }; if (on) n[id] = true; else delete n[id]; return n; });
  const hold = useRef(null);
  const holdStart = (id) => { if (!isPhone) return; clearTimeout(hold.current); hold.current = setTimeout(() => { hold.current = 'held'; pick(id, true); }, HOLD_MS); };
  const holdEnd = () => { if (hold.current !== 'held') clearTimeout(hold.current); };
  const openLead = (id) => {
    if (hold.current === 'held') { hold.current = null; return; }
    if (picking && isPhone) { pick(id, !picked[id]); return; }
    navigate(`/coach/leads/${id}`);
  };
  useEffect(() => { const onKey = (e) => { if (e.key === 'Escape' && picking) setPicked({}); }; document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey); }, [picking]);

  const [menu, setMenu] = useState(null); // 'view' | 'tag' | `col:<key>` | `row:<lead id>` | `stage:<lead id>`
  const anchors = useRef({});
  const anchor = (key) => ({ current: anchors.current[key] || anchors.current[String(key).replace(/^stage:/, 'row:')] || null });
  const ref = (key) => (el) => { anchors.current[key] = el; };
  const menuLead = menu && /^(row|stage):/.test(menu) ? open.find((l) => l.id === menu.slice(menu.indexOf(':') + 1)) || null : null;

  const tagPicked = async (tag) => {
    setMenu(null);
    const add = pickedLeads.filter((l) => !data.tagLinks.some((k) => k.tag_id === tag.id && k.item_id === l.id)).map((l) => ({ tag_id: tag.id, item_kind: 'lead', item_id: l.id, coach_id: coach.id }));
    try {
      await saveRows(userId, add.map((row) => ['coach_tag_links', row]));
      toast.saved({ message: `${tag.name} added to ${pickedLeads.length} ${pickedLeads.length === 1 ? 'lead' : 'leads'}`, long: true, onUndo: async () => { for (const row of add) await removeRow(userId, 'coach_tag_links', keyOf('coach_tag_links', row)).catch(() => {}); } });
      setPicked({});
    } catch (error) { toast.error(error?.message || SAVE_PROBLEM); }
  };

  // ---- someone emailed who isn't in the portal yet: one quiet line
  const waiting = waitingRows(emailWaiting)[0] || null;
  const waitingEmail = waiting ? emails.find((e) => e.id === waiting.email_id) || null : null;
  const addWaiting = async () => {
    const id = newId();
    const made = leadFromWaiting(waiting, waitingEmail, { id, eventId: newId(), coachId: coach.id, stages, nowIso: new Date().toISOString(), todayKey });
    if (made.error) { toast.show(made.error); return; }
    try {
      const status = await saveRows(userId, [['coach_leads', made.lead], ['coach_email_waiting', made.waiting], ['coach_email_links', made.link], ['coach_lead_events', made.event]]);
      toast.saved({
        message: status === 'queued' ? 'Will sync' : made.toast, long: true,
        onUndo: async () => {
          await removeRow(userId, 'coach_lead_events', made.event.id).catch(() => {});
          await removeRow(userId, 'coach_email_links', keyOf('coach_email_links', made.link)).catch(() => {});
          await saveRow(userId, 'coach_email_waiting', waiting).catch(() => {});
          await removeRow(userId, 'coach_leads', id).catch(() => {});
        },
      });
    } catch (error) { toast.error(error?.message || SAVE_PROBLEM); }
  };
  const notNow = () => saveRow(userId, 'coach_email_waiting', dismissWaiting(waiting, new Date().toISOString()))
    .then(() => toast.saved({ message: WAITING_DISMISSED, long: true, onUndo: () => saveRow(userId, 'coach_email_waiting', waiting).catch(() => {}) }))
    .catch((error) => toast.error(error?.message || SAVE_PROBLEM));

  // ---- two who may be one person: one quiet line, never a pop-up
  const notSame = settings.crm?.not_same;
  const duplicate = useMemo(() => leadDuplicates(all, notSame)[0] || null, [all, notSame]);

  // ---- the table's columns
  const columns = useMemo(() => leadTableColumns(leadFields), [leadFields]);
  const visible = columns.filter((c) => !list.hidden.includes(c.key));
  const chosenIn = (c) => (c.field ? (list.filters.fields?.[c.field.id] || []).length : (list.filters[FILTER_KEYS[c.key]] || []).length);
  const onlyOf = (c) => {
    if (c.only === 'stage') return stages.filter((s) => !s.is_won).map((s) => [s.id, s.name]);
    if (Array.isArray(c.only)) return c.only;
    if (!c.field || (c.field.kind !== 'choice' && c.field.kind !== 'text')) return [];
    const options = c.field.kind === 'choice' ? c.field.options || [] : [...new Set(values.filter((v) => v.field_id === c.field.id).map((v) => String(v.value_text ?? '')).filter(Boolean))].sort().slice(0, 20);
    return options.length ? [...options.map((o) => [o, o]), ['none', 'Not set']] : [];
  };
  const toggleOnly = (c, value) => {
    const flip = (now) => (now.includes(value) ? now.filter((x) => x !== value) : [...now, value]);
    const filters = c.field ? { ...list.filters, fields: { ...(list.filters.fields || {}), [c.field.id]: flip(list.filters.fields?.[c.field.id] || []) } } : { ...list.filters, [FILTER_KEYS[c.key]]: flip(list.filters[FILTER_KEYS[c.key]] || []) };
    setList({ ...list, filters, viewId: null });
  };
  const sortBy = (value) => { setList({ ...list, sort: value, viewId: null }); setMenu(null); };

  // ---- the board: a card moves to another stage. With a mouse it is dragged; with the keyboard a focused card moves left
  // and right with the arrow keys; on a phone or a tablet its More menu has "Edit stage". A won lead stays won.
  const boardRef = useRef(null);
  useEvenCards(boardRef, [layout, filtered.length, stages.length, JSON.stringify(more), filtered.map((l) => `${l.id}${l.stage_id}${l.next_step}${l.value}`).join('|')]);
  const [drag, setDrag] = useState(null); // { card, over, dx, dy, rect }
  const dragging = useRef(null);
  const dragged = useRef(false);
  const [moved, setMoved] = useState(''); // said to screen readers
  const focusCard = useRef(null);
  const moveTo = (id, toId, { keepFocus = false } = {}) => {
    const lead = open.find((l) => l.id === id);
    const to = stageOf(stages, toId);
    if (!lead || !to || lead.stage_id === to.id || lead.won_at) return;
    if (keepFocus) focusCard.current = id;
    actions.moveStage(lead, to).then((ok) => { if (ok) setMoved(`Moved to ${to.name}.`); });
  };
  useEffect(() => {
    if (!focusCard.current) return;
    const card = [...(boardRef.current?.querySelectorAll('[data-card]') || [])].find((el) => el.dataset.card === focusCard.current);
    if (card && document.activeElement !== card) card.focus();
    if (card) focusCard.current = null;
  });
  const stageUnder = (e) => document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-stage]')?.dataset.stage || null;
  const cardDown = (e, card) => {
    dragged.current = false;
    if (e.pointerType !== 'mouse' || e.button !== 0 || card.won) return;
    dragging.current = { card, x: e.clientX, y: e.clientY, on: false, rect: e.currentTarget.closest('.cc-card').getBoundingClientRect() };
  };
  const cardMove = (e) => {
    const d = dragging.current;
    if (!d) return;
    if (!d.on) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < DRAG_START) return;
      d.on = true;
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    setDrag({ card: d.card, over: stageUnder(e), dx: e.clientX - d.x, dy: e.clientY - d.y, rect: d.rect });
  };
  const cardUp = (e) => {
    const d = dragging.current;
    dragging.current = null;
    if (!d?.on) return;
    dragged.current = true; // the click that follows a drag opens nothing
    setTimeout(() => { dragged.current = false; }, 80);
    setDrag(null);
    if (e.type === 'pointerup') moveTo(d.card.id, stageUnder(e));
  };
  useEffect(() => {
    if (!drag) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') { dragging.current = null; setDrag(null); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drag]);
  const cardKey = (e, card) => {
    if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || card.won) return;
    e.preventDefault();
    const to = stageBesideLead(stages, { stage_id: card.stageId }, e.key === 'ArrowLeft' ? -1 : 1);
    if (to) moveTo(card.id, to.id, { keepFocus: true });
  };
  const cardWords = (c) => (
    <>
      <b>{c.name}</b>
      {c.sub && <small>{c.sub}</small>}
      {(c.valueWords || c.opened) && <span className="cc-lead-v">{c.valueWords}{c.opened && <i>{c.opened}</i>}</span>}
      {c.next.line && <span className="cc-lead-next">{c.next.line}</span>}
      {c.quiet && <span className="cc-lead-quiet">{c.quiet}</span>}
      {c.ready && <span className={`cc-lead-ready${c.isReady ? ' cc-lead-ready--ok' : ''}`}>{c.ready}</span>}
    </>
  );
  const touchMenus = isPhone || touchFirst;
  const moreButton = (c, cls = '') => (
    <button type="button" className={`cc-round cc-lead-more${cls}`} ref={ref(`row:${c.id}`)} aria-haspopup="menu" aria-expanded={menu === `row:${c.id}` || menu === `stage:${c.id}`} aria-label={`More for ${c.name}`} onClick={() => setMenu(`row:${c.id}`)}>{MORE}</button>
  );
  const rowAct = (key, lead) => {
    if (key === 'stage') { setMenu(`stage:${lead.id}`); return; }
    setMenu(null);
    if (key === 'select') pick(lead.id, true);
    else setEditing({ kind: key, id: lead.id });
  };

  const toolbar = (
    <>
      {!isPhone && <div className="cc-search-field"><SearchField label="Search leads" placeholder="Search leads" value={q} onChange={setQ} /></div>}
      <div className="cc-toolbar">
        {!isPhone && <div className="cc-seg"><InlineChoice ariaLabel="Layout" semantics="pressed" options={noTable ? LEAD_LAYOUTS.slice(0, 2) : LEAD_LAYOUTS} value={layout} onChange={(v) => setList({ ...list, layout: v })} form="pills" /></div>}
        {isPhone && <TextLink ref={ref('view')} aria-haspopup="menu" aria-expanded={menu === 'view'} onClick={() => setMenu('view')}>View</TextLink>}
        {isPhone ? <TextLink onClick={() => setPanel('filter')}>{filtersOn ? `Filter, ${filtersOn} on` : 'Filter'}</TextLink> : <Button variant="outline" onClick={() => setPanel('filter')}>{filtersOn ? `Filter, ${filtersOn} on` : 'Filter'}</Button>}
        <span className="cc-toolbar-who">{viewName || (narrowed ? leadCountWords(filtered.length, open.length) : 'All leads')}</span>
      </div>
      {isPhone && <div className="cc-search-field"><SearchField label="Search leads" placeholder="Search leads" value={q} onChange={setQ} /></div>}
      <PopMenu open={menu === 'view'} onClose={() => setMenu(null)} anchorRef={anchor('view')} title="View">
        <MenuLabel>Show as</MenuLabel>
        {LEAD_LAYOUTS.slice(0, 2).map((l) => <MenuItem key={l.value} checked={layout === l.value} onClick={() => { setList({ ...list, layout: l.value }); setMenu(null); }}>{l.label}</MenuItem>)}
      </PopMenu>
      {(filtersOn > 0 || viewName) && (
        <p className="cc-quiet cc-lead-line"><span>{leadCountWords(filtered.length, open.length)}.</span><TextLink onClick={() => setList({ ...list, filters: EMPTY_LEAD_FILTERS, viewId: null })}>Clear</TextLink></p>
      )}
      {waiting && (
        <p className="cc-quiet cc-lead-line">
          <span>{waitingLine(waiting, waitingEmail)}</span>
          <TextLink onClick={addWaiting}>{WAITING_BUTTONS.add}</TextLink>
          <TextLink onClick={notNow}>{WAITING_BUTTONS.dismiss}</TextLink>
        </p>
      )}
      {duplicate && <p className="cc-quiet cc-lead-line"><span>{duplicate.line}</span><TextLink onClick={() => setMergePair(duplicate)}>Review</TextLink></p>}
    </>
  );

  const wide = layout !== 'list';
  return (
    <div className="cc-page">
      <div className={`cc-col${wide ? ' cc-col--wide' : ''}`}>
        <PageHeader title="Leads" />
        {toolbar}
        {open.length === 0 && <p className="cc-quiet">{LEADS_EMPTY}</p>}
        {open.length > 0 && filtered.length === 0 && <p className="cc-quiet">{LEADS_NO_MATCH}</p>}

        {layout === 'board' && stages.length > 0 && (open.length === 0 || filtered.length > 0) && (
          <div className={`cc-lboard cc-fade${drag ? ' cc-board--dragging' : ''}`} ref={boardRef} key="board">
            {board.map((col, at) => {
              const cards = more[col.stage.id] ? col.cards : col.cards.slice(0, BOARD_FOLD);
              return (
                <section key={col.stage.id} className={`cc-board-col${drag && drag.over === col.stage.id && drag.card.stageId !== col.stage.id ? ' cc-board-col--over' : ''}`} data-stage={col.stage.id} aria-label={`${col.stage.name}, ${col.count}`}>
                  <div className="cc-board-head"><span>{col.stage.name}</span><span>{col.count}</span></div>
                  <div className={`cc-lboard-sum${col.value ? '' : ' cc-lboard-sum--none'}`}><span>{col.valueWords}</span>{col.likelyWords && <small>{col.likelyWords}</small>}</div>
                  <div className="cc-board-cards">
                    {cards.map((c) => (
                      <div key={c.id} className={`cc-card cc-lead-card${drag?.card.id === c.id ? ' cc-card--lifted' : ''}${touchMenus && !c.won ? ' cc-card--more' : ''}`}>
                        <button
                          type="button"
                          className="cc-card-open"
                          data-card={c.id}
                          aria-roledescription={c.won ? undefined : 'Card that can be moved to another stage'}
                          onClick={() => { if (!dragged.current) openLead(c.id); }}
                          onKeyDown={(e) => cardKey(e, c)}
                          onPointerDown={(e) => { cardDown(e, c); holdStart(c.id); }}
                          onPointerMove={cardMove}
                          onPointerUp={(e) => { cardUp(e); holdEnd(); }}
                          onPointerCancel={(e) => { cardUp(e); holdEnd(); }}
                        >
                          {cardWords(c)}
                        </button>
                        {touchMenus && !c.won && moreButton(c, ' cc-lead-more--card')}
                      </div>
                    ))}
                  </div>
                  {col.cards.length > cards.length && <div className="cc-acts"><TextLink aria-label={`Show all ${col.cards.length} in ${col.stage.name}`} onClick={() => setMore({ ...more, [col.stage.id]: true })}>Show all {col.cards.length}</TextLink></div>}
                  {at === 0 && <div className="cc-lboard-add"><AddButton onClick={() => setPanel('add')}>Add lead</AddButton></div>}
                </section>
              );
            })}
            <span className="ds-sr" role="status" aria-live="polite">{moved}</span>
          </div>
        )}
        {drag && (
          <div className="cc-card cc-lead-card cc-card-ghost" aria-hidden="true" style={{ left: drag.rect.left, top: drag.rect.top, width: drag.rect.width, minHeight: drag.rect.height, transform: `translate(${drag.dx}px, ${drag.dy}px)` }}>
            <div className="cc-card-open">{cardWords(drag.card)}</div>
          </div>
        )}

        {layout === 'list' && filtered.length > 0 && (
          <div className={`cc-fade${picking ? ' cc-picking' : ''}`} key="list">
            {board.filter((col) => col.cards.length > 0).map((col) => {
              const cards = more[col.stage.id] ? col.cards : col.cards.slice(0, BOARD_FOLD);
              return (
                <Part key={col.stage.id} title={col.stage.name}>
                  <div className="cc-rows cc-lead-rows">
                    {cards.map((c) => (
                      <div key={c.id} className={`cc-pick-row${picked[c.id] ? ' cc-pick-row--on' : ''}`} onPointerDown={() => holdStart(c.id)} onPointerUp={holdEnd} onPointerLeave={holdEnd} onPointerCancel={holdEnd}>
                        <PickTick on={Boolean(picked[c.id])} name={c.name} onChange={(on) => pick(c.id, on)} />
                        <div className="cc-lead-rw">
                          <Row title={c.name} facts={[c.sub, c.next.step]} when={<>{c.quiet && <small>{c.quiet}</small>}{c.won ? c.wonOn : c.next.when}</>} onClick={() => openLead(c.id)} />
                          {!c.won ? moreButton(c) : <span />}
                        </div>
                      </div>
                    ))}
                  </div>
                  {col.cards.length > cards.length && <div className="cc-acts"><TextLink aria-label={`Show all ${col.cards.length} in ${col.stage.name}`} onClick={() => setMore({ ...more, [col.stage.id]: true })}>Show all {col.cards.length}</TextLink></div>}
                </Part>
              );
            })}
          </div>
        )}

        {layout === 'table' && filtered.length > 0 && (
          <div className={`cc-table-wrap cc-fade${picking ? ' cc-picking' : ''}`} key="table">
            <table className="cc-table cc-lead-table">
              <thead>
                <tr>
                  <th scope="col"><button type="button" className={`cc-th${list.sort.startsWith('name') ? ' cc-th--on' : ''}`} ref={ref('col:name')} aria-haspopup="menu" aria-expanded={menu === 'col:name'} onClick={() => setMenu('col:name')}>Name</button></th>
                  {visible.map((c) => (
                    <th key={c.key} scope="col"><button type="button" className={`cc-th${c.sorts.some(([v]) => v === list.sort) || chosenIn(c) ? ' cc-th--on' : ''}`} ref={ref(`col:${c.key}`)} aria-haspopup="menu" aria-expanded={menu === `col:${c.key}`} onClick={() => setMenu(`col:${c.key}`)}>{headingWords(c.label, chosenIn(c) || '')}</button></th>
                  ))}
                  <th scope="col" className="cc-th-add"><button type="button" className="cc-round" aria-label="Add field" onClick={() => setField({ id: newId(), name: '', kind: 'text', optionsText: '' })}><span className="ds-addrow-mark" aria-hidden="true" /></button></th>
                </tr>
              </thead>
              <tbody>
                {(more.table ? shown : shown.slice(0, TABLE_FOLD)).map((l) => {
                  const c = leadCard(l, ctx);
                  return (
                    <tr key={l.id} className={`cc-pick-row${picked[l.id] ? ' cc-pick-row--on' : ''}`}>
                      <td>
                        <PickTick on={Boolean(picked[l.id])} name={l.name} onChange={(on) => pick(l.id, on)} />
                        <button type="button" className="cc-table-name" onClick={() => openLead(l.id)}>{l.name}</button>
                        {c.sub && <small>{c.sub}</small>}
                      </td>
                      {visible.map((col) => {
                        if (col.key === 'stage') return <td key={col.key}>{c.won ? c.stage : <button type="button" className="cc-cell" ref={ref(`stage:${l.id}`)} aria-haspopup="menu" aria-expanded={menu === `stage:${l.id}`} aria-label={`Stage, ${c.stage || 'none'}. Edit`} onClick={() => setMenu(`stage:${l.id}`)}>{c.stage || 'Choose'}</button>}</td>;
                        if (col.key === 'next') return <td key={col.key}>{c.won ? '' : <><EditCell label="Next step" value={l.next_step || ''} onSave={(typed) => { actions.nextStep(l, typed); return true; }} />{c.next.when && <small>{c.next.when}</small>}</>}</td>;
                        if (col.key === 'last') return <td key={col.key}>{c.won ? c.wonOn : c.lastContact}{c.quiet && <small>{c.quiet}</small>}</td>;
                        if (col.key === 'value') return <td key={col.key}><EditCell label="Value" value={l.value == null ? '' : String(l.value)} words={c.valueWords} onSave={(typed) => actions.value(l, typed)} /></td>;
                        const v = fieldValue(col.field, values, l.id);
                        return <td key={col.key}><EditCell label={col.label} value={v} words={fieldWords(col.field, v, todayKey)} kind={col.field.kind} options={col.field.options || []} onSave={(typed) => actions.field(l, col.field, typed, values)} /></td>;
                      })}
                      <td />
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!more.table && shown.length > TABLE_FOLD && <div className="cc-acts"><TextLink onClick={() => setMore({ ...more, table: true })}>Show all {shown.length}</TextLink></div>}
            <PopMenu open={menu === 'col:name'} onClose={() => setMenu(null)} anchorRef={anchor('col:name')} title="Name">
              <MenuLabel>Sort</MenuLabel>
              <MenuItem checked={list.sort === 'name'} onClick={() => sortBy('name')}>A to Z</MenuItem>
              <MenuItem checked={list.sort === 'name_desc'} onClick={() => sortBy('name_desc')}>Z to A</MenuItem>
              {list.hidden.length > 0 && <MenuLabel>Hidden columns</MenuLabel>}
              {columns.filter((c) => list.hidden.includes(c.key)).map((c) => <MenuItem key={c.key} onClick={() => { setList({ ...list, hidden: list.hidden.filter((k) => k !== c.key), viewId: null }); setMenu(null); }}>Show {c.label}</MenuItem>)}
            </PopMenu>
            {visible.map((c) => (
              <PopMenu key={c.key} open={menu === `col:${c.key}`} onClose={() => setMenu(null)} anchorRef={anchor(`col:${c.key}`)} title={c.label}>
                <MenuLabel>Sort</MenuLabel>
                {c.sorts.map(([value, label]) => <MenuItem key={value} checked={list.sort === value} onClick={() => sortBy(value)}>{label}</MenuItem>)}
                {onlyOf(c).length > 0 && <MenuLabel>Show only</MenuLabel>}
                {onlyOf(c).map(([value, label]) => <MenuItem key={value} checked={(c.field ? list.filters.fields?.[c.field.id] || [] : list.filters[FILTER_KEYS[c.key]] || []).includes(value)} onClick={() => toggleOnly(c, value)}>{label}</MenuItem>)}
                <MenuLabel>Column</MenuLabel>
                <MenuItem onClick={() => { setList({ ...list, hidden: [...list.hidden, c.key], viewId: null }); setMenu(null); }}>Hide this column</MenuItem>
              </PopMenu>
            ))}
          </div>
        )}

        <PopMenu open={Boolean(menuLead) && menu.startsWith('row:')} onClose={() => setMenu(null)} anchorRef={anchor(menu || '')} title="More">
          {menuLead && LEAD_ROW_MENU.filter(([key]) => key !== 'select' || layout !== 'board').map(([key, label]) => <MenuItem key={key} onClick={() => rowAct(key, menuLead)}>{label}</MenuItem>)}
        </PopMenu>
        <PopMenu open={Boolean(menuLead) && menu.startsWith('stage:')} onClose={() => setMenu(null)} anchorRef={anchor(menu || '')} title="Stage">
          {menuLead && stages.map((s) => <MenuItem key={s.id} checked={menuLead.stage_id === s.id} onClick={() => { setMenu(null); moveTo(menuLead.id, s.id); }}>{s.name}</MenuItem>)}
        </PopMenu>

        {layout !== 'board' && <div className="cc-add"><AddButton onClick={() => setPanel('add')}>Add lead</AddButton></div>}
        <div className="cc-acts">
          <TextLink onClick={() => setPanel('stages')}>Edit stages</TextLink>
          <TextLink onClick={() => setPanel('import')}>Import from a spreadsheet</TextLink>
          <TextLink onClick={() => setPanel('export')}>Export</TextLink>
          <TextLink onClick={() => navigate('/coach/leads/cold')}>Cold leads</TextLink>
        </div>

        {picking && (
          <div className="cc-bulk" role="toolbar" aria-label={`${pickedLeads.length} chosen`}>
            <span className="cc-bulk-n" aria-live="polite">{pickedLeads.length} chosen</span>
            {tags.length > 0 && <button type="button" className="cc-bulk-btn" ref={ref('tag')} aria-haspopup="menu" aria-expanded={menu === 'tag'} onClick={() => setMenu('tag')}>Tag</button>}
            {pickedLeads.length === 2 && <button type="button" className="cc-bulk-btn" onClick={() => { setMergePair({ a: leadOf(pickedLeads[0].id), b: leadOf(pickedLeads[1].id) }); setPicked({}); }}>Merge</button>}
            <IconButton label="Stop choosing" onClick={() => setPicked({})} />
            <PopMenu open={menu === 'tag'} onClose={() => setMenu(null)} anchorRef={anchor('tag')} title="Tag">
              {tags.map((t) => <MenuItem key={t.id} onClick={() => tagPicked(t)}>{t.name}</MenuItem>)}
            </PopMenu>
          </div>
        )}
      </div>
      <AddLeadPanel open={panel === 'add'} onClose={() => setPanel(null)} />
      <StagesPanel open={panel === 'stages'} onClose={() => setPanel(null)} />
      <ImportLeadsPanel open={panel === 'import'} onClose={() => setPanel(null)} />
      <ExportLeadsPanel open={panel === 'export'} onClose={() => setPanel(null)} shown={layout === 'table' ? shown : board.flatMap((col) => col.cards.map((c) => leadOf(c.id))).filter(Boolean)} />
      <LeadFilterPanel open={panel === 'filter'} onClose={() => setPanel(null)} list={list} setList={setList} count={filtered.length} />
      <EditLeadPanel lead={editingLead('edit')} onClose={() => setEditing(null)} />
      <LogCallPanel lead={editingLead('call')} onClose={() => setEditing(null)} />
      <ColdPanel lead={editingLead('cold')} onClose={() => setEditing(null)} />
      <MergeLeadsPanel pair={mergePair} onClose={() => setMergePair(null)} />
      <FieldPanel draft={field} setDraft={setField} appliesTo="lead" />
    </div>
  );
}
