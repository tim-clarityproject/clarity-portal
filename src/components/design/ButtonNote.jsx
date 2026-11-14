// A short note under a button (rule 29v, Tim, 5 Nov, 15:09): centred on
// the button, 10px below it, in the secondary grey, with no full stop. On
// a phone the button and its note run full width.
//
//   <ButtonNote note="~3 minutes"><Button variant="primary">Start my check-in</Button></ButtonNote>
// beside: on a laptop the note sits to the right of the button instead
// (M9's guest start: "~15 minutes" beside "Start my plan"); on a phone it
// is centred under it as usual.
export default function ButtonNote({ note, children, className = '', beside = false }) {
  const words = typeof note === 'string' ? note.replace(/\.\s*$/, '') : note;
  return (
    <div className={`ds-btn-note${beside ? ' ds-btn-note--beside' : ''} ${className}`.trim()}>
      {children}
      {words && <p className="ds-btn-note-text">{words}</p>}
    </div>
  );
}
