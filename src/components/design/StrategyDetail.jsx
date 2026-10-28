import { Button, IconButton } from './Button';
import './design.css';

// A Strategy's detail (M1 stratDetail): its habits, each with its measure
// on a grey line; its to-dos this sprint; and the work tagged to it this
// sprint. On a laptop it opens in the page below the tiles, with the
// rotated crosshair to close it (StrategyDetail). On a phone the page puts
// the same body in the slide-across panel, which is full screen there
// (StrategyDetailBody), with "Edit this Strategy" in its footer.
//
// strategy: { name, servesLine, habits: [{ id, name, line }],
//             todos: [{ id, text, when }] }
// work:     [{ id, name, line }] tools tagged to it (none can be tagged yet).
export function StrategyDetailBody({ strategy: s, work = [], sprintRunning = true, headingLevel = 'h4' }) {
  const H = headingLevel;
  return (
    <div className="ds-sdetail-grid">
      <div className="ds-sdetail-col">
        <H className="ds-sdetail-label">Habits</H>
        {s.habits.length ? (
          <ul className="ds-sdetail-rows">
            {s.habits.map((h) => (
              <li key={h.id}>{h.name}<span>{h.line}</span></li>
            ))}
          </ul>
        ) : (
          <p className="ds-sdetail-none">This Strategy has no habits yet.</p>
        )}
        <H className="ds-sdetail-label ds-sdetail-label--next">To-dos this sprint</H>
        {s.todos.length ? (
          <ul className="ds-sdetail-rows">
            {s.todos.map((t) => (
              <li key={t.id}>{t.text}<span>{t.when}</span></li>
            ))}
          </ul>
        ) : (
          <p className="ds-sdetail-none">{sprintRunning ? 'No to-dos are open for this Strategy.' : 'To-dos show here once a sprint is running.'}</p>
        )}
      </div>
      <div className="ds-sdetail-col">
        <H className="ds-sdetail-label">Work this sprint</H>
        {work.length ? (
          <ul className="ds-sdetail-rows">
            {work.map((w) => (
              <li key={w.id}>{w.name}<span>{w.line}</span></li>
            ))}
          </ul>
        ) : (
          <>
            <p className="ds-sdetail-none">Nothing is tagged to this Strategy yet.</p>
            <p className="ds-sdetail-none ds-sdetail-none--after">When a tool finishes, you can tag it to this Strategy.</p>
          </>
        )}
      </div>
    </div>
  );
}

export default function StrategyDetail({ id, strategy, work, sprintRunning, onClose, onEdit }) {
  return (
    <section id={id} className="ds-sdetail" aria-label={strategy.name}>
      <div className="ds-sdetail-head">
        <div>
          <h3 className="ds-sdetail-title">{strategy.name}</h3>
          <p className="ds-sdetail-serves">{strategy.servesLine}</p>
        </div>
        <IconButton label="Close" onClick={onClose} />
      </div>
      <StrategyDetailBody strategy={strategy} work={work} sprintRunning={sprintRunning} />
      {onEdit && (
        <div className="ds-actions ds-sdetail-actions">
          <Button onClick={onEdit}>Edit this Strategy</Button>
        </div>
      )}
    </section>
  );
}
