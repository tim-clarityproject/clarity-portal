import { Button } from './Button';
import TextBox from './TextBox';
import './design.css';

// Next steps (M9 "Next steps", and M10's; Tim, 13 Nov): every row alike.
// The step in its own box, one line saying where it is ("It’s in this
// week’s sprint.", mint when it is; "It isn’t in this week’s sprint
// yet."; "It’s in your backlog."), and one link ("Add to this week", or
// "Edit" once added). A guest has no sprint, so a row with no `line`
// shows the box alone.
//
//   <NextSteps>
//     <NextStepRow
//       label="Next step 1"            the box's name for screen readers
//       value={text} onChange={setText}
//       line="It isn’t in this week’s sprint yet." good={false}
//       link="Add to this week" linkLabel="Add next step 1 to this week"
//       onLink={open}
//     />
//   </NextSteps>
export function NextSteps({ children }) {
  return <div className="ds-nextsteps">{children}</div>;
}

export function NextStepRow({ label, value, onChange, maxLength, line, good = false, link, linkLabel, onLink, linkRef }) {
  return (
    <div className="ds-nextstep">
      <TextBox ariaLabel={label} lines="one" value={value} onChange={onChange} maxLength={maxLength} />
      {line && (
        <div className="ds-nextstep-meta">
          <span className={good ? 'ds-nextstep-good' : undefined}>{line}</span>
          {link && <Button ref={linkRef} variant="text" aria-label={linkLabel} onClick={onLink}>{link}</Button>}
        </div>
      )}
    </div>
  );
}
