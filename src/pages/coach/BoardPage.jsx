import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { idFromAddress } from '../../lib/coach/address';
import { AddButton, Button, Dropdown, IconButton, InlineChoice, PageHeader, SlidePanel, SwitchRow, TextBox, TextField, useIsPhone, useToast } from '../../components/design';
import { deviceKey, readJson, writeJson } from '../../lib/deviceStore';
import { newId, removeRow, saveRow, saveRows } from '../../lib/coach/store';
import {
  BOARD_COLUMN_KINDS, BOARD_LAYOUTS, BOARD_NAME_MAX, BOARD_WORDS, boardCellChange, boardDeletePlan, boardDraft, boardFieldWords, boardItemDraft, boardItemFromTyped, boardItemsOf, boardSavePlan,
  boardStageBeside, boardStagesOf, boardTable, boardView, canEditBoard, moveBoardItem, newBoardItem, SHARE_HELP, sharedBy, sharedToast, shareLabel,
} from '../../lib/coach/crm';
import { Back, Detail, EditCell, MenuItem, MenuLabel, Part, PopMenu, Row, TextLink, useCoachPortal, useNarrowerThan } from './parts';
import { useEvenCards } from './Clients';
import { calm } from './crmParts';
import './leftovers.css';
import './leads.css';
import './crm.css';
import { countFigure } from '../../lib/coach/numbers';

// One board (M11 seq 77: "A board: Speaking", "A board as a table"): its
// cards as a board, a list or a table behind the gliding view switch (the
// table at 1100px and wider). A card moves between stages by dragging, with
// the arrow keys, or from its own panel; a field is typed over in the
// table. "Edit this board" holds its name, stages, fields and who can see
// it (shared with associates is off until the owner turns it on, and a
// shared board can be read, never changed, by an associate). Every rule
// and word is crm.js's.

const LAYOUTS = BOARD_LAYOUTS.map(([value, label]) => ({ value, label }));
const DRAG_START = 6;
const GRIP = <svg className="cc-brd-grip-icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="5.5" cy="4" r="1.1" /><circle cx="10.5" cy="4" r="1.1" /><circle cx="5.5" cy="8" r="1.1" /><circle cx="10.5" cy="8" r="1.1" /><circle cx="5.5" cy="12" r="1.1" /><circle cx="10.5" cy="12" r="1.1" /></svg>;

export default function BoardPage() {
  const id = idFromAddress(useParams().id); // any case in the address (tidy follow-up 4)
  const navigate = useNavigate();
  const toast = useToast();
  const isPhone = useIsPhone();
  const { userId, coach, isOwner, boards, boardStages, boardItems, coaches, todayKey } = useCoachPortal();
  const board = boards.find((b) => b.id === id) || null;
  const mayEdit = canEditBoard(board, { isOwner }) && board?.coach_id === coach.id;
  const stages = useMemo(() => (board ? boardStagesOf(boardStages, board.id) : []), [board, boardStages]);
  const items = useMemo(() => (board ? boardItemsOf(boardItems, board.id) : []), [board, boardItems]);
  const associates = coaches.filter((c) => c.active && c.role !== 'owner').map((c) => ({ display_first_name: c.first_name }));
  const ownerName = coaches.find((c) => c.role === 'owner')?.first_name || '';

  const layoutKey = deviceKey('cache', userId, 'coach-board-layout');
  const [layoutKept, setLayoutKept] = useState(() => readJson(layoutKey) || 'board');
  const noTable = useNarrowerThan(1100);
  const layout = noTable && layoutKept === 'table' ? 'board' : LAYOUTS.some((l) => l.value === layoutKept) ? layoutKept : 'board';
  const setLayout = (v) => { setLayoutKept(v); writeJson(layoutKey, v); };

  const [card, setCard] = useState(null); // { id, isNew, typed }
  const [cardProblem, setCardProblem] = useState(null);
  const [edit, setEdit] = useState(null); // Edit this board's draft
  const [editProblem, setEditProblem] = useState(null);
  const [menu, setMenu] = useState(null); // 'view' | `stage:<card id>`
  const anchors = useRef({});
  const ref = (key) => (el) => { anchors.current[key] = el; };
  const anchor = (key) => ({ current: anchors.current[key] || null });
  const busy = useRef(false);
  const problem = (e) => toast.error(calm(e));

  const say = async (work, message, onUndo) => {
    try { const status = await work(); toast.saved({ message: status === 'queued' ? 'Will sync' : message, long: true, onUndo: onUndo ? () => Promise.resolve(onUndo()).catch(problem) : undefined }); return true; } catch (e) { problem(e); return false; }
  };

  // ---- a card moves to another stage: dragged with a mouse, with the arrow keys, or from its own panel
  const boardRef = useRef(null);
  const view = useMemo(() => (board ? boardView(board, boardStages, boardItems, todayKey) : []), [board, boardStages, boardItems, todayKey]);
  useEvenCards(boardRef, [layout, items.map((i) => `${i.id}${i.stage_id}${i.title}${JSON.stringify(i.field_values)}`).join('|'), stages.length]);
  const [drag, setDrag] = useState(null);
  const dragging = useRef(null);
  const dragged = useRef(false);
  const [moved, setMoved] = useState('');
  const focusCard = useRef(null);
  const moveTo = (cardId, toId, { keepFocus = false } = {}) => {
    if (!mayEdit) return;
    const item = items.find((i) => i.id === cardId);
    const to = stages.find((s) => s.id === toId);
    const next = item && to ? moveBoardItem(item, to.id, items) : null;
    if (!next) return;
    if (keepFocus) focusCard.current = cardId;
    say(() => saveRow(userId, 'coach_board_items', next), `Moved to ${to.name}.`, () => saveRow(userId, 'coach_board_items', item)).then((ok) => { if (ok) setMoved(`Moved to ${to.name}.`); });
  };
  useEffect(() => {
    if (!focusCard.current) return;
    const el = [...(boardRef.current?.querySelectorAll('[data-card]') || [])].find((x) => x.dataset.card === focusCard.current);
    if (el && document.activeElement !== el) el.focus();
    if (el) focusCard.current = null;
  });
  const stageUnder = (e) => document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-stage]')?.dataset.stage || null;
  const cardDown = (e, c, stageId) => {
    dragged.current = false;
    if (!mayEdit || e.pointerType !== 'mouse' || e.button !== 0) return;
    dragging.current = { card: c, stageId, x: e.clientX, y: e.clientY, on: false, rect: e.currentTarget.closest('.cc-card').getBoundingClientRect() };
  };
  const cardMove = (e) => {
    const d = dragging.current;
    if (!d) return;
    if (!d.on) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < DRAG_START) return;
      d.on = true;
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    setDrag({ card: d.card, stageId: d.stageId, over: stageUnder(e), dx: e.clientX - d.x, dy: e.clientY - d.y, rect: d.rect });
  };
  const cardUp = (e) => {
    const d = dragging.current;
    dragging.current = null;
    if (!d?.on) return;
    dragged.current = true;
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
  const cardKey = (e, c, stageId) => {
    if (!mayEdit || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    const to = boardStageBeside(boardStages, board.id, stageId, e.key === 'ArrowLeft' ? -1 : 1);
    if (to) moveTo(c.id, to.id, { keepFocus: true });
  };
  const cardWords = (c) => (<><b>{c.title}</b>{c.line && <small>{c.line}</small>}{c.more && <span>{c.more}</span>}</>);

  // ---- a card's panel
  const openCard = (cardId) => {
    const item = items.find((i) => i.id === cardId);
    if (!item) return;
    setCardProblem(null);
    setCard({ id: item.id, isNew: false, typed: boardItemDraft(board, item, todayKey) });
  };
  const addCard = (stageId) => { setCardProblem(null); setCard({ id: newId(), isNew: true, typed: { ...boardItemDraft(board, null, todayKey), stageId: stageId || stages[0]?.id || null } }); };
  const setTyped = (change) => { setCard((c) => ({ ...c, typed: { ...c.typed, ...change } })); setCardProblem(null); };
  const saveCard = async () => {
    if (busy.current) return;
    const before = card.isNew ? null : items.find((i) => i.id === card.id) || null;
    let base = before;
    if (card.isNew) {
      const made = newBoardItem({ id: card.id, coachId: coach.id, board, stageId: card.typed.stageId, title: card.typed.title, items });
      if (made.error) { setCardProblem({ error: made.error, at: 'title' }); return; }
      base = made.item;
    }
    if (!base) { setCard(null); return; }
    const read = boardItemFromTyped(board, base, card.isNew ? { ...card.typed, stageId: base.stage_id } : card.typed, { todayKey, stages: boardStages, items });
    if (read.error) { setCardProblem(read); return; }
    busy.current = true;
    const ok = await say(() => saveRow(userId, 'coach_board_items', read.item), card.isNew ? BOARD_WORDS.cardAdded : 'Saved', () => (before ? saveRow(userId, 'coach_board_items', before) : removeRow(userId, 'coach_board_items', read.item.id)));
    busy.current = false;
    if (ok) setCard(null);
  };
  const deleteCard = async () => {
    const before = items.find((i) => i.id === card.id);
    if (!before) { setCard(null); return; }
    if (await say(() => removeRow(userId, 'coach_board_items', before.id).then(() => 'saved'), 'Deleted', () => saveRow(userId, 'coach_board_items', before))) setCard(null);
  };
  const cell = (item, columnId, typed) => {
    const read = boardCellChange(board, item, columnId, typed, todayKey);
    if (read.error) { toast.show(read.error); return false; }
    say(() => saveRow(userId, 'coach_board_items', read.item), 'Saved', () => saveRow(userId, 'coach_board_items', item));
    return true;
  };

  // ---- Edit this board
  const rowsRef = useRef(null);
  const focusGrip = useRef(null);
  const focusBox = useRef(null);
  useEffect(() => {
    if (focusGrip.current) { rowsRef.current?.querySelector(`[data-grip="${focusGrip.current}"]`)?.focus(); focusGrip.current = null; }
    if (focusBox.current) { rowsRef.current?.querySelector(`[data-box="${focusBox.current}"] input`)?.focus(); focusBox.current = null; }
  });
  const setDraft = (change) => { setEdit((d) => ({ ...d, ...change })); setEditProblem(null); };
  const stageStep = (stageId, step) => setEdit((d) => {
    const shown = d.stages.filter((s) => !s.removed);
    const at = shown.findIndex((s) => s.id === stageId);
    const other = shown[at + step];
    if (at < 0 || !other) return d;
    const list = [...d.stages];
    const a = list.findIndex((s) => s.id === stageId);
    const b = list.findIndex((s) => s.id === other.id);
    [list[a], list[b]] = [list[b], list[a]];
    focusGrip.current = stageId;
    return { ...d, stages: list };
  });
  const saveBoard = async () => {
    if (busy.current) return;
    const plan = boardSavePlan(board, boardStages, boardItems, edit, { coachId: coach.id, boards });
    if (plan.error) { setEditProblem(plan.error); return; }
    if (plan.same) { setEdit(null); return; }
    busy.current = true;
    const sharing = plan.board.shared !== (board.shared === true);
    const ok = await say(async () => {
      const status = await saveRows(userId, [['coach_boards', plan.board], ...plan.stages.map((s) => ['coach_board_stages', s]), ...plan.items.map((i) => ['coach_board_items', i])]);
      for (const stageId of plan.removeStages) await removeRow(userId, 'coach_board_stages', stageId);
      return status;
    }, sharing ? sharedToast(plan.board.shared, associates) : plan.toast, async () => {
      await saveRows(userId, [...plan.undo.stages.map((s) => ['coach_board_stages', s]), ...plan.undo.items.map((i) => ['coach_board_items', i]), ['coach_boards', plan.undo.board]]);
      for (const stageId of plan.undo.removeStages) await removeRow(userId, 'coach_board_stages', stageId).catch(() => {});
    });
    busy.current = false;
    if (ok) setEdit(null);
  };
  const deleteBoard = async () => {
    const plan = boardDeletePlan(board, new Date().toISOString());
    if (await say(() => saveRow(userId, 'coach_boards', plan.board), plan.toast, () => saveRow(userId, 'coach_boards', plan.undo))) { setEdit(null); navigate('/coach/boards'); }
  };

  if (!board) {
    return <div className="cc-page"><div className="cc-col"><Back to={BOARD_WORDS.title} onClick={() => navigate('/coach/boards')} /><PageHeader title="Board" /><p className="cc-quiet">{BOARD_WORDS.gone}</p></div></div>;
  }

  const table = layout === 'table' ? boardTable(board, boardStages, boardItems, todayKey) : null;
  const cardItem = card && !card.isNew ? items.find((i) => i.id === card.id) || null : null;
  const menuCard = menu?.startsWith('stage:') ? items.find((i) => i.id === menu.slice(6)) || null : null;
  const at = (key) => (cardProblem?.at === key ? <p className="cc-problem" role="alert">{cardProblem.error}</p> : null);
  return (
    <div className="cc-page">
      <div className={`cc-col${layout === 'list' ? '' : ' cc-col--wide'}`}>
        <Back to={BOARD_WORDS.title} onClick={() => navigate('/coach/boards')} />
        <PageHeader title={board.name} />
        {!mayEdit && <p className="cc-quiet">{sharedBy(ownerName)}</p>}
        <div className="cc-toolbar">
          {!isPhone && <div className="cc-seg"><InlineChoice ariaLabel="Layout" semantics="pressed" options={noTable ? LAYOUTS.slice(0, 2) : LAYOUTS} value={layout} onChange={setLayout} form="pills" /></div>}
          {isPhone && <TextLink ref={ref('view')} aria-haspopup="menu" aria-expanded={menu === 'view'} onClick={() => setMenu('view')}>View</TextLink>}
          {mayEdit && (isPhone ? <TextLink onClick={() => { setEditProblem(null); setEdit(boardDraft(board, boardStages)); }}>{BOARD_WORDS.edit}</TextLink> : <Button variant="outline" onClick={() => { setEditProblem(null); setEdit(boardDraft(board, boardStages)); }}>{BOARD_WORDS.edit}</Button>)}
        </div>
        <PopMenu open={menu === 'view'} onClose={() => setMenu(null)} anchorRef={anchor('view')} title="View">
          <MenuLabel>Show as</MenuLabel>
          {LAYOUTS.slice(0, 2).map((l) => <MenuItem key={l.value} checked={layout === l.value} onClick={() => { setLayout(l.value); setMenu(null); }}>{l.label}</MenuItem>)}
        </PopMenu>

        {layout === 'board' && (
          <div className={`cc-lboard cc-brd cc-fade${drag ? ' cc-board--dragging' : ''}`} ref={boardRef} key="board">
            {view.map((col) => (
              <section key={col.stage.id} className={`cc-board-col${drag && drag.over === col.stage.id && drag.stageId !== col.stage.id ? ' cc-board-col--over' : ''}`} data-stage={col.stage.id} aria-label={`${col.stage.name}, ${col.count}`}>
                <div className="cc-board-head"><span>{col.stage.name}</span><span>{countFigure(col.count)}</span></div>
                <div className="cc-board-cards">
                  {col.cards.map((c) => (
                    <div key={c.id} className={`cc-card${drag?.card.id === c.id ? ' cc-card--lifted' : ''}`}>
                      <button
                        type="button"
                        className="cc-card-open"
                        data-card={c.id}
                        aria-roledescription={mayEdit ? 'Card that can be moved to another stage' : undefined}
                        onClick={() => { if (!dragged.current) openCard(c.id); }}
                        onKeyDown={(e) => cardKey(e, c, col.stage.id)}
                        onPointerDown={(e) => cardDown(e, c, col.stage.id)}
                        onPointerMove={cardMove}
                        onPointerUp={cardUp}
                        onPointerCancel={cardUp}
                      >
                        {cardWords(c)}
                      </button>
                    </div>
                  ))}
                </div>
                {mayEdit && <div className="cc-lboard-add"><AddButton aria-label={`Add card to ${col.stage.name}`} onClick={() => addCard(col.stage.id)}>{BOARD_WORDS.addCard}</AddButton></div>}
              </section>
            ))}
            <span className="ds-sr" role="status" aria-live="polite">{moved}</span>
          </div>
        )}
        {drag && (
          <div className="cc-card cc-card-ghost" aria-hidden="true" style={{ left: drag.rect.left, top: drag.rect.top, width: drag.rect.width, minHeight: drag.rect.height, transform: `translate(${drag.dx}px, ${drag.dy}px)` }}>
            <div className="cc-card-open">{cardWords(drag.card)}</div>
          </div>
        )}

        {layout === 'list' && (
          <div className="cc-fade" key="list">
            {items.length === 0 && <p className="cc-quiet">{BOARD_WORDS.empty}</p>}
            {view.filter((col) => col.cards.length > 0).map((col) => (
              <Part key={col.stage.id} title={col.stage.name}>
                <div className="cc-rows cc-lead-rows">
                  {col.cards.map((c) => <Row key={c.id} title={c.title} facts={[c.line, c.more]} when="" onClick={() => openCard(c.id)} />)}
                </div>
              </Part>
            ))}
            {mayEdit && <div className="cc-add"><AddButton onClick={() => addCard(null)}>{BOARD_WORDS.addCard}</AddButton></div>}
          </div>
        )}

        {layout === 'table' && (
          <div className="cc-table-wrap cc-fade" key="table">
            {table.rows.length === 0 && <p className="cc-quiet">{BOARD_WORDS.empty}</p>}
            {table.rows.length > 0 && (
              <table className="cc-table cc-lead-table cc-brd-table">
                <thead>
                  <tr>
                    {table.head.map((h) => <th key={h} scope="col"><span className="cc-brd-th">{h}</span></th>)}
                    {mayEdit && <th scope="col" className="cc-th-add"><button type="button" className="cc-round" aria-label={BOARD_WORDS.addField} onClick={() => { setEditProblem(null); setEdit(boardDraft(board, boardStages)); }}><span className="ds-addrow-mark" aria-hidden="true" /></button></th>}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((r) => {
                    const item = items.find((i) => i.id === r.id);
                    return (
                      <tr key={r.id}>
                        <td><button type="button" className="cc-table-name" onClick={() => openCard(r.id)}>{r.title}</button></td>
                        <td>{mayEdit ? <button type="button" className="cc-cell" ref={ref(`stage:${r.id}`)} aria-haspopup="menu" aria-expanded={menu === `stage:${r.id}`} aria-label={`Stage, ${r.stage || 'none'}. Edit`} onClick={() => setMenu(`stage:${r.id}`)}>{r.stage || 'Choose'}</button> : r.stage}</td>
                        {r.cells.map((c) => {
                          const column = board.columns.find((x) => x.id === c.column);
                          if (!mayEdit) return <td key={c.column}>{c.words}</td>;
                          const raw = item?.field_values?.[c.column];
                          return <td key={c.column}><EditCell label={column.name} value={column.kind === 'date' ? boardFieldWords(column, raw, todayKey) : raw == null ? '' : String(raw)} words={c.words} onSave={(typed) => cell(item, c.column, typed)} /></td>;
                        })}
                        {mayEdit && <td />}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {mayEdit && <div className="cc-add"><AddButton onClick={() => addCard(null)}>{BOARD_WORDS.addCard}</AddButton></div>}
          </div>
        )}
        <PopMenu open={Boolean(menuCard)} onClose={() => setMenu(null)} anchorRef={anchor(menu || '')} title="Stage">
          {menuCard && stages.map((s) => <MenuItem key={s.id} checked={menuCard.stage_id === s.id} onClick={() => { setMenu(null); moveTo(menuCard.id, s.id); }}>{s.name}</MenuItem>)}
        </PopMenu>
      </div>

      <SlidePanel draftKey={`board-card:${id}:${card?.isNew ? 'new' : card?.id}`}
        open={Boolean(card)}
        onClose={() => setCard(null)}
        title={card?.isNew ? BOARD_WORDS.newCard : cardItem?.title || 'Card'}
        footer={card && mayEdit ? <div className="cc-panel-foot">{card.isNew ? <span /> : <TextLink onClick={deleteCard}>Delete</TextLink>}<Button variant="primary" onClick={saveCard}>{card.isNew ? BOARD_WORDS.addCard : 'Save'}</Button></div> : null}
      >
        {card && mayEdit && (
          <>
            <p className="cc-quiet cc-brd-of">{board.name}</p>
            <div className="cc-field"><TextField label="Name" value={card.typed.title} maxLength={200} autoComplete="off" onChange={(e) => setTyped({ title: e.target.value })} />{at('title')}</div>
            <div className="cc-field"><Dropdown label="Stage" options={stages.map((s) => ({ value: s.id, label: s.name }))} value={card.typed.stageId} onChange={(v) => setTyped({ stageId: v })} /></div>
            {board.columns.map((c) => (
              <div key={c.id} className="cc-field">
                <TextField label={c.name} type={c.kind === 'date' ? 'date' : 'text'} inputMode={c.kind === 'number' ? 'decimal' : undefined} value={card.typed.fields[c.id] ?? ''} maxLength={300} autoComplete="off" onChange={(e) => setTyped({ fields: { ...card.typed.fields, [c.id]: e.target.value } })} />
                {at(c.id)}
              </div>
            ))}
            <div className="cc-field"><TextBox label="Notes" value={card.typed.notes} maxLength={6000} onChange={(v) => setTyped({ notes: v })} /></div>
          </>
        )}
        {card && !mayEdit && cardItem && (
          <>
            <p className="cc-quiet cc-brd-of">{board.name}</p>
            <Detail label="Stage">{stages.find((s) => s.id === cardItem.stage_id)?.name || ''}</Detail>
            {board.columns.map((c) => <Detail key={c.id} label={c.name}>{boardFieldWords(c, cardItem.field_values?.[c.id], todayKey) || 'Not added'}</Detail>)}
            {cardItem.notes && <p className="cc-email-body">{cardItem.notes}</p>}
          </>
        )}
      </SlidePanel>

      <SlidePanel draftKey={`board-edit:${id}`}
        open={Boolean(edit)}
        onClose={() => setEdit(null)}
        title={BOARD_WORDS.edit}
        footer={edit ? <div className="cc-panel-foot"><TextLink onClick={deleteBoard}>{BOARD_WORDS.remove}</TextLink><Button variant="primary" onClick={saveBoard}>Save</Button></div> : null}
      >
        {edit && (
          <div ref={rowsRef}>
            <div className="cc-field"><TextField label="Name" value={edit.name} maxLength={BOARD_NAME_MAX} autoComplete="off" onChange={(e) => setDraft({ name: e.target.value })} /></div>
            <h3 className="cc-brd-h">Stages</h3>
            <div className="cc-brd-rows">
              {edit.stages.filter((s) => !s.removed).map((s, i, shown) => (
                <div key={s.id} className="cc-brd-row cc-brd-row--stage" data-box={s.id}>
                  <button type="button" className="cc-round cc-stage-grip" data-grip={s.id} aria-label={`Move ${s.name || 'this stage'}. It is number ${i + 1} of ${shown.length}. Use the up and down arrow keys.`}
                    onKeyDown={(e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); stageStep(s.id, e.key === 'ArrowUp' ? -1 : 1); } }}
                    onClick={() => stageStep(s.id, i === 0 ? 1 : -1)}>{GRIP}</button>
                  <input className="cc-cell-input" aria-label={`Stage ${i + 1}’s name`} value={s.name} maxLength={40} autoComplete="off" onChange={(e) => setDraft({ stages: edit.stages.map((x) => (x.id === s.id ? { ...x, name: e.target.value } : x)) })} />
                  <IconButton label={`Remove ${s.name || 'this stage'}`} onClick={() => setDraft({ stages: stages.some((x) => x.id === s.id) ? edit.stages.map((x) => (x.id === s.id ? { ...x, removed: true } : x)) : edit.stages.filter((x) => x.id !== s.id) })} />
                </div>
              ))}
            </div>
            <div className="cc-add"><AddButton onClick={() => { const sid = newId(); focusBox.current = sid; setDraft({ stages: [...edit.stages, { id: sid, name: '', removed: false }] }); }}>{BOARD_WORDS.addStage}</AddButton></div>
            <h3 className="cc-brd-h">Fields</h3>
            <div className="cc-brd-rows">
              {edit.columns.filter((c) => !c.removed).map((c, i) => (
                <div key={c.id} className="cc-brd-row cc-brd-row--field" data-box={c.id}>
                  <input className="cc-cell-input" aria-label={`Field ${i + 1}’s name`} value={c.name} maxLength={40} autoComplete="off" onChange={(e) => setDraft({ columns: edit.columns.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)) })} />
                  <select className="cc-cell-input" aria-label={`What kind of field ${c.name || `field ${i + 1}`} is`} value={c.kind} onChange={(e) => setDraft({ columns: edit.columns.map((x) => (x.id === c.id ? { ...x, kind: e.target.value } : x)) })}>
                    {BOARD_COLUMN_KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  <IconButton label={`Remove ${c.name || 'this field'}`} onClick={() => setDraft({ columns: edit.columns.map((x) => (x.id === c.id ? { ...x, removed: true } : x)) })} />
                </div>
              ))}
            </div>
            <div className="cc-add"><AddButton onClick={() => { const cid = newId(); focusBox.current = cid; setDraft({ columns: [...edit.columns, { id: cid, name: '', kind: 'text', removed: false }] }); }}>{BOARD_WORDS.addField}</AddButton></div>
            <h3 className="cc-brd-h">{BOARD_WORDS.who}</h3>
            <SwitchRow label={shareLabel(associates)} note={edit.shared ? SHARE_HELP : BOARD_WORDS.offMeans} checked={edit.shared} onChange={(on) => setDraft({ shared: on })} />
            {editProblem && <p className="cc-problem" role="alert">{editProblem}</p>}
          </div>
        )}
      </SlidePanel>
    </div>
  );
}
