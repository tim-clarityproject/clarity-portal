import { Row } from '../../../components/design/Blocks';

// A fact as a list row (Polish 1, Stage C, C2): a short value sits at the right in grey (rule 14); one that may run long
// (an email address, a file name, an address) sits under the name instead, so the name is never squashed into a narrow
// column and nothing wraps letter by letter (rule 20).
const LONG = 22;
export default function FactRow({ name, value, done = false, ...rest }) {
  const v = value == null ? '' : String(value);
  return v.length > LONG ? <Row name={name} sub={v} {...rest} /> : <Row name={name} value={v || undefined} className={done ? 'cc-money-done' : undefined} {...rest} />;
}
