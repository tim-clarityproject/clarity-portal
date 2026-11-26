import { useEffect, useState } from 'react';
import { SavedSignature, SignaturePad, SlidePanel, useToast } from '../../components/design';
import { NEEDS, loadSavedSignature, saveDrawnSignature } from '../../lib/coaching/agreements';
import { signingWords } from '../../lib/billing/agreementText';
import { needsConnection } from '../../lib/friendlyError';
import MistakeLine from '../../components/agreements/MistakeLine';

// My signature (Phase 6b run 1; mock-up M13 A7): the saved signature, in the side panel from the
// right (full screen on a phone). "It’s used when you sign an agreement." With one saved, its box
// and "Draw a new signature"; otherwise the signature box with Clear and "Use this signature",
// which keeps it in the account ("Saved to your account for next time."). No "Type instead" here.

const WORDS = signingWords('');
const LINES = ['It’s used when you sign an agreement.', 'We record your full name, the date and the time with it.'];

export default function MySignature({ open, onClose, userId }) {
  const toast = useToast();
  const [saved, setSaved] = useState(null);
  const [drawing, setDrawing] = useState(false);
  const [problem, setProblem] = useState(null);

  useEffect(() => {
    if (!open) return undefined;
    let live = true;
    setDrawing(false);
    setProblem(null);
    loadSavedSignature(userId).then((row) => { if (live) setSaved(row?.image || null); }).catch(() => { /* the box shows instead */ });
    return () => { live = false; };
  }, [open, userId]);

  const keep = async (image) => {
    setProblem(null);
    try {
      await saveDrawnSignature(userId, image);
      setSaved(image);
      setDrawing(false);
      toast.show('Saved to your account for next time.');
    } catch (e) {
      setProblem(e?.offline ? needsConnection('Saving your signature') : e?.message || 'That didn’t save. Check your connection and try again.');
    }
  };

  return (
    <SlidePanel open={open} onClose={onClose} title="My signature" className="ds-who-panel agree-mysig">
      <div className="ds-explain-lines">
        {LINES.map((line) => <p key={line} className="ds-explain-line">{line}</p>)}
      </div>
      <div className="agree-mysig-area">
        {saved && !drawing ? (
          <SavedSignature image={saved} action={WORDS.drawNew} onAction={() => setDrawing(true)} />
        ) : (
          <SignaturePad words={WORDS} onUse={keep} onEmpty={() => setProblem(NEEDS.draw)} problem={problem === NEEDS.draw ? problem : null} />
        )}
        {problem && problem !== NEEDS.draw && <div className="ds-panel-needs"><MistakeLine>{problem}</MistakeLine></div>}
      </div>
    </SlidePanel>
  );
}
