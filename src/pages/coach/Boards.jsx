import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, Chip, ChipRow, PageHeader, SlidePanel, TextField, useToast } from '../../components/design';
import { newId, removeRow, saveRows } from '../../lib/coach/store';
import { BOARD_HELP, BOARD_NAME_MAX, BOARD_TEMPLATES, BOARD_WORDS, boardLine, boardProblem, boardsFor, newBoard, templateWords } from '../../lib/coach/crm';
import { Row, useCoachPortal } from './parts';
import { calm } from './crmParts';
import './crm.css';

// Boards (M11 seq 77: "Boards", "Boards: a new board"): the owner's own
// boards for anything tracked in stages (speaking, partners, a book), each
// with its own stages and fields. An associate sees only the boards the
// owner has shared, and can't change them (the database's rules say the
// same). The rules and words are crm.js's.

export default function Boards() {
  const { userId, coach, isOwner, boards, boardStages, boardItems } = useCoachPortal();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const shown = boardsFor(boards, { isOwner });
  const [draft, setDraft] = useState(null); // { name, template }
  const [problem, setProblem] = useState(null);
  const busy = useRef(false);
  // "New board" chosen in search opens its panel once.
  useEffect(() => {
    if (location.state?.open === 'board' && isOwner) { setDraft({ name: '', template: 'blank' }); navigate(location.pathname, { replace: true, state: null }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state?.open]);
  const template = draft ? BOARD_TEMPLATES.find((t) => t.key === draft.template) || BOARD_TEMPLATES[0] : null;
  const words = template ? templateWords(template) : null;

  const make = async () => {
    if (busy.current) return;
    const line = boardProblem(draft.name, boards);
    if (line) { setProblem(line); return; }
    busy.current = true;
    const made = newBoard({ id: newId(), coachId: coach.id, name: draft.name, template: draft.template, newId, boards });
    try {
      const status = await saveRows(userId, [['coach_boards', made.board], ...made.stages.map((s) => ['coach_board_stages', s])]);
      toast.saved({
        message: status === 'queued' ? 'Will sync' : BOARD_WORDS.made, long: true,
        onUndo: async () => { for (const s of made.stages) await removeRow(userId, 'coach_board_stages', s.id).catch(() => {}); await removeRow(userId, 'coach_boards', made.board.id).catch(() => {}); navigate('/coach/boards'); },
      });
      setDraft(null);
      navigate(`/coach/boards/${made.board.id}`);
    } catch (e) { setProblem(calm(e)); } finally { busy.current = false; }
  };

  return (
    <div className="cc-page">
      <div className="cc-col">
        <PageHeader title={BOARD_WORDS.title} />
        {shown.length === 0 && <p className="cc-quiet">{isOwner ? BOARD_WORDS.none : BOARD_WORDS.noneShared}</p>}
        <div className="cc-rows">
          {shown.map((b) => <Row key={b.id} title={b.name} facts={boardLine(b, boardStages, boardItems)} when="" onClick={() => navigate(`/coach/boards/${b.id}`)} />)}
        </div>
        {isOwner && <div className="cc-acts cc-board-new"><Button variant="outline" onClick={() => { setProblem(null); setDraft({ name: '', template: 'blank' }); }}>{BOARD_WORDS.add}</Button></div>}
      </div>

      <SlidePanel open={Boolean(draft)} onClose={() => setDraft(null)} title={BOARD_WORDS.add} footer={<div className="cc-panel-foot cc-panel-foot--end"><Button variant="primary" onClick={make}>{BOARD_WORDS.make}</Button></div>}>
        {draft && (
          <>
            <div className="cc-field">
              <TextField label={BOARD_WORDS.nameLabel} value={draft.name} maxLength={BOARD_NAME_MAX} autoComplete="off" onChange={(e) => { setDraft({ ...draft, name: e.target.value }); setProblem(null); }} />
              {problem && <p className="cc-problem" role="alert">{problem}</p>}
            </div>
            <div className="cc-field">
              <span className="cc-field-label">{BOARD_WORDS.from}</span>
              <ChipRow label={BOARD_WORDS.from}>{BOARD_TEMPLATES.map((t) => <Chip key={t.key} pressed={draft.template === t.key} onClick={() => setDraft({ ...draft, template: t.key })}>{t.name}</Chip>)}</ChipRow>
            </div>
            <dl className="cc-board-tpl" aria-live="polite">
              <div><dt>Stages</dt><dd>{words.stages}</dd></div>
              <div><dt>Fields</dt><dd>{words.fields}</dd></div>
            </dl>
            <p className="cc-note">{BOARD_HELP}</p>
          </>
        )}
      </SlidePanel>
    </div>
  );
}
