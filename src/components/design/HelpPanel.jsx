import './design.css';

// A help panel (Tim, 23 Oct: "one line, then an example"; M6): one line
// saying what something is, then an example in the text colour, on the
// raised surface.
export default function HelpPanel({ line, example }) {
  return (
    <div className="ds-help-panel">
      <p>{line}</p>
      {example && <p className="ds-help-panel-example">{example}</p>}
    </div>
  );
}
