import { Row } from '../../../components/design/Blocks';

// A fact as a list row (Polish 1, Stage C, C2): a short value sits at the right in grey (rule 14); one that may run long
// (an email address, a file name, an address) sits under the name instead, so the name is never squashed into a narrow
// column and nothing wraps letter by letter (rule 20).
// `keepYear`: the value is a document's own name (a PDF's file name), which keeps its year as it was attached, so it is
// marked `data-year` for the design check (writing rule 28 is for dates the page itself writes).
const LONG = 22;
const ADDRESS = /^[^\s@]+@[^\s@]+$/;
export default function FactRow({ name, value, done = false, keepYear = false, ...rest }) {
  const v = value == null ? '' : String(value);
  // An email address may break anywhere: it is one long "word" wider than a phone's column (Stage D, DG item 6).
  const shown = keepYear && v ? <span data-year="">{v}</span> : ADDRESS.test(v) ? <span className="ds-address">{v}</span> : v;
  return v.length > LONG ? <Row name={name} sub={shown} {...rest} /> : <Row name={name} value={shown || undefined} className={done ? 'cc-money-done' : undefined} {...rest} />;
}
