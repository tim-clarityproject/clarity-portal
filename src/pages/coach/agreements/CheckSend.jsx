import { Navigate, useParams } from 'react-router-dom';

// Check before sending (Phase 6b run 3, Group B; Polish 1, Stage C): M28 version 6 makes the check the builder's last
// question, "Does this read right?", with its sentences, Change, the standard terms (an edited clause named on their
// row), the note and how it goes. This address, kept for links and the menu's name, opens it there.
export default function CheckSend() {
  const { id } = useParams();
  return <Navigate to={`/coach/agreements/${id}/edit?q=check`} replace />;
}
