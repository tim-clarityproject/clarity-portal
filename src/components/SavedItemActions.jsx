import { useContext, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { deleteSavedItemWithUndo } from '../lib/savedItemDelete';
import { savedItemsChanged } from '../lib/savedItemsChanged';
import { Button, useToast } from './design';

// Delete, inside the opened item (Tim, 5 Nov: "no icons in list rows; edit
// and delete sit inside the item once opened"). An item opened from My
// Plans or My Reviews carries its row (savedItemRef) in the address's
// state; this shows a quiet "Delete" for it. Opened any other way, it
// shows nothing.
//
// Deleting happens straight away (writing rule 14; Phase 8a follow-up,
// step 2): no "Delete this?". It goes back to the list with "Deleted" and
// Undo, and Undo puts the item back as it was, with its own id.
// `onDeleted` runs once it has gone, before leaving: a guided tool clears
// what it keeps of the item on this device there.
const UNDO_PROBLEM = 'That didn’t bring it back. Check your connection and try again.';

export default function SavedItemActions({ className = '', onDeleted }) {
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useContext(AuthContext);
  const busy = useRef(false); // one delete per press
  const item = location.state?.savedItem;
  if (!item || !item.canDelete || !user) return null;

  const remove = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const undo = await deleteSavedItemWithUndo(user.id, item);
      onDeleted?.();
      savedItemsChanged();
      navigate(item.from || '/welcome', { replace: true });
      toast.saved({
        message: 'Deleted',
        onUndo: async () => {
          try {
            await undo();
            savedItemsChanged();
          } catch (err) {
            console.error('[SavedItemActions] undo:', err);
            toast.error(UNDO_PROBLEM);
          }
        },
      });
    } catch (err) {
      console.error('[SavedItemActions] delete:', err);
      toast.error('That didn’t delete. Check your connection and try again.');
    } finally {
      busy.current = false;
    }
  };

  return (
    <div className={`saved-item-actions no-print ${className}`.trim()}>
      <Button variant="text" onClick={remove}>Delete</Button>
    </div>
  );
}
