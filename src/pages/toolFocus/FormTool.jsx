import { useNavigate } from 'react-router-dom';
import { ToolFrame, useToast } from '../../components/design';
import { TOOL_CLOSED } from '../../content/pageLines/client';
import './formTool.css';

// The older form tools (Pre-mortem, Give difficult feedback, Meeting planner,
// Time audit, Pressure plan, the Journal) in focus mode (Polish 1, rule 21;
// B3, Stage B): A1's ToolFrame gives × ("Close and save my place") at the
// left, "Step n of m" at the right, the progress line, the tool's name as the
// small grey eyebrow, the 20px question, and Next and Back at the foot. Under
// the foot sit the tool's quiet links: Save as draft and Discard. The tool's
// own data, saving and steps are unchanged: each step is still its own
// address, and what's typed is kept on the device as before (useDraft).
//
// name, step, steps (leave steps out for a one-screen tool), question, eye (who can see it, beside the question), hint,
// onNext + nextLabel (never greyed out: pass `need`, a calm line saying what's
// missing, and show it once Next was pressed), onBack, onSaveDraft, onDiscard,
// saveError, closeTo (where × goes when there's no page to go back to), wide
// (a step with a table: the whole 720px column).
export default function FormTool({
  name, step = 1, steps, question, eye, hint, onNext, nextLabel, onBack, need, saveError,
  onSaveDraft, onDiscard, closeTo = '/welcome', wide = false, children, className = '',
}) {
  const navigate = useNavigate();
  const toast = useToast();
  // × keeps what's typed (it's on the device) and goes back where they came from.
  const close = () => {
    toast.show(TOOL_CLOSED);
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
    else navigate(closeTo);
  };
  return (
    <div className={`ft-page ${className}`.trim()}>
      <ToolFrame
        step={step}
        steps={steps || 1}
        name={name}
        question={question}
        eye={eye}
        hint={hint}
        onClose={close}
        onNext={onNext}
        nextLabel={nextLabel}
        onBack={onBack}
        // A one-screen tool has no "Step 1 of 1".
        stepWords={steps ? undefined : <span aria-hidden="true" />}
        className={`ft-tool${wide ? ' ft-tool--wide' : ''}`}
      >
        {children}
        {need && (
          <div className="ds-error ft-need" role="alert">
            <span className="ds-error-mark" aria-hidden="true">!</span>
            <span>{need}</span>
          </div>
        )}
        {saveError && <p className="plan-save-error ft-need" role="alert">{saveError}</p>}
      </ToolFrame>
      {(onSaveDraft || onDiscard) && (
        <div className="ft-more">
          {onSaveDraft && <button type="button" className="ds-more ds-more--bare ft-link" onClick={onSaveDraft}>Save as draft</button>}
          {onDiscard && <button type="button" className="ds-more ds-more--bare ft-link" onClick={onDiscard}>Discard</button>}
        </div>
      )}
    </div>
  );
}

// A field inside a step: its question (16px) over its control, 24px between fields.
export function FormField({ label, htmlFor, help, children }) {
  return (
    <div className="ft-field">
      {label && (htmlFor ? <label className="ft-label" htmlFor={htmlFor}>{label}</label> : <div className="ft-label">{label}</div>)}
      {help && <p className="ft-help">{help}</p>}
      {children}
    </div>
  );
}
