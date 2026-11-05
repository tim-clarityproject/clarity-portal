// A short note under a button (rule 29v, Tim, 5 Nov, 15:09): centred on
// the button, 10px below it, in the secondary grey, with no full stop. On
// a phone the button and its note run full width.
//
//   <ButtonNote note="~3 minutes"><Button variant="primary">Start my check-in</Button></ButtonNote>
export default function ButtonNote({ note, children, className = '' }) {
  const words = typeof note === 'string' ? note.replace(/\.\s*$/, '') : note;
  return (
    <div className={`ds-btn-note ${className}`.trim()}>
      {children}
      {words && <p className="ds-btn-note-text">{words}</p>}
    </div>
  );
}
