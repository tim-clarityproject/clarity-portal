import { Button, ExplainLink, useToast } from '../../components/design';
import { saveRow } from '../../lib/coach/store';
import { useCoachPortal } from './parts';

// Help that can be dismissed (Tim, 19 Nov): every explanation panel ends
// with "Don’t show me this again", which hides the link that opens it, with
// Undo. Settings, Look has "Hidden help" with "Show it again". What is
// hidden is kept with the coach's settings (coach_settings.hidden_help,
// migration 050), so it follows them to every device.

/** What this coach has hidden, and the ways to hide one and to show them all again. */
export function useHiddenHelp() {
  const { userId, settings } = useCoachPortal();
  const toast = useToast();
  const hidden = settings.hidden_help && typeof settings.hidden_help === 'object' ? settings.hidden_help : {};
  const save = (next) => saveRow(userId, 'coach_settings', { ...settings, hidden_help: next }).catch(() => toast.error('That didn’t save. Check your connection and try again.'));
  return {
    hidden,
    count: Object.values(hidden).filter(Boolean).length,
    isHidden: (key) => hidden[key] === true,
    hide: (key) => {
      save({ ...hidden, [key]: true });
      toast.saved({ message: 'Hidden. Settings, Look shows it again.', long: true, onUndo: () => save(hidden) });
    },
    showAll: () => {
      save({});
      toast.saved({ message: 'Help shows again', long: true, onUndo: () => save(hidden) });
    },
  };
}

/**
 * A quiet link that opens an explanation in the side panel, ending with
 * "Don’t show me this again". Once hidden, the link is gone.
 * @param {{ helpKey: string, explain: object, children: any }} props `explain` is the shared ExplainPanel's ({ title, terms | lines })
 */
export function HelpLink({ helpKey, explain, children, className = '' }) {
  const help = useHiddenHelp();
  if (help.isHidden(helpKey)) return null;
  return (
    <ExplainLink explain={explain} className={className} action={(close) => <Button variant="text" onClick={() => { close(); help.hide(helpKey); }}>Don’t show me this again</Button>}>
      {children}
    </ExplainLink>
  );
}
