import { ErrorMessage } from '../design/Status';
import './agreements.css';

// A mistake as M28 v6 draws it (#s-err, .err): one short line of coral words straight under the box or choice it is
// about, 13px, never a filled box or panel (Tim, 26 Nov 15:55). The shared ErrorMessage is that line now, so this is
// a thin wrapper of it: one mistake line in the portal. Several lines (`.ds-line` spans) each take their own line.
export default function MistakeLine({ children }) {
  if (!children) return null;
  return <ErrorMessage className="ag-mistake">{children}</ErrorMessage>;
}
