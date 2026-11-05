import { useContext, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { deleteSavedItem } from '../lib/savedItemDelete';
import { Button, useToast } from './design';
import DeleteDialog from './ui/DeleteDialog';

// Delete, inside the opened item (Tim, 5 Nov: "no icons in list rows; edit
// and delete sit inside the item once opened"). An item opened from My
// Plans or My Reviews carries its row (savedItemRef) in the address's
// state; this shows a quiet "Delete" for it, and after deleting goes back
// to the list with "Deleted". Opened any other way, it shows nothing.
export default function SavedItemActions({ className = '' }) {
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useContext(AuthContext);
  const item = location.state?.savedItem;
  const [asking, setAsking] = useState(false);
  if (!item || !item.canDelete || !user) return null;

  const confirm = async () => {
    setAsking(false);
    try {
      await deleteSavedItem(user.id, item);
      navigate(item.from || '/welcome', { replace: true, state: { toast: 'Deleted' } });
    } catch (err) {
      console.error('[SavedItemActions] delete:', err);
      toast.error('That didn’t delete. Check your connection and try again.');
    }
  };

  return (
    <div className={`saved-item-actions no-print ${className}`.trim()}>
      <Button variant="text" onClick={() => setAsking(true)}>Delete</Button>
      <DeleteDialog
        open={asking}
        title="Delete this?"
        body={item.title ? `“${item.title}” will be removed for good. This cannot be undone.` : 'This cannot be undone.'}
        onConfirm={confirm}
        onCancel={() => setAsking(false)}
      />
    </div>
  );
}
