import WhoSees from './WhoSees';
import { sharingLine } from '../../lib/guest/sharing';

// The eye on every guest tool (Tim, 14 Nov, 09:49 and 09:52; M7b "Who can
// see this"): the guest chooses "Only you" or "You and [coach]", the coach
// by default, with the line under the choice that follows it ("Tim sent
// you the link and will see your results." or "Tim won’t see your answers,
// but you still get your PDF."). Choosing saves at once and says "Saved"
// (the page's `onShare`, which may return a promise).
//
//   coachName  the first name of the coach who sent the link, from the
//              link (never typed into the code); "your coach" without it
//   shared     the choice now (true: the coach sees the results)
//   onShare    (shared) => saves it. Without it the eye only says who the
//              answers go to (a page that can't save the choice yet)
export default function GuestEye({ coachName, shared = true, onShare }) {
  const coach = String(coachName || '').trim() || undefined;
  if (!onShare) {
    return <WhoSees audience="coach" coachName={coach} note={`Your answers go to ${coach || 'your coach'}, who sent you the link.`} />;
  }
  return (
    <WhoSees
      plain
      audience={shared ? 'coach' : 'me'}
      coachName={coach}
      line={sharingLine(coach, shared)}
      onChange={(audience) => onShare(audience === 'coach')}
    />
  );
}
