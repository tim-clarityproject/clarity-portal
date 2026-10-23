import './design.css';

// A statement people rate (Tim, 23 Oct; writing rule 51: the heading is
// the task, then the statement, then the answers). Used for the check-in's
// software statements and later the 360 tool. The statement sits in a
// soft panel: the surface colour, 16px corners, no border, no colour,
// left-aligned, 18px on desktop and 17px on phone, as wide as the answer
// rows. The who-sees label and the answer rows follow it. The component
// adds the curly quotation marks, so content never types them.
export default function StatementPanel({ children }) {
  return <p className="ds-statement">{'“'}{children}{'”'}</p>;
}
