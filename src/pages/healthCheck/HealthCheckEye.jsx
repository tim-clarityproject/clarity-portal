import WhoSees from '../../components/design/WhoSees';

// The Health Check's eye for someone without an account (M7b "Who can see
// this"; Tim, 14 Nov, 09:49). Until a guest's own choice can be saved, it
// says who the answers go to, as every guest tool's eye does. With
// `onShare` (the choice's own save; it arrives with the sharing setting on
// guest work) it becomes the choice: Only you, or You and the coach, the
// coach by default, with the line under it that follows the choice.
//
//   coachName: the first name of the coach who sent the link, or nothing
//   shared:    the saved choice (true: the coach sees the results)
//   onShare:   (shared) => saves it; may return a promise
export function sharingLine(coachName, shared) {
  const who = coachName || 'Your coach';
  return shared
    ? `${who} sent you the link and will see your results.`
    : `${who} won’t see your answers, but you still get your PDF.`;
}

export default function HealthCheckEye({ coachName, shared = true, onShare }) {
  if (!onShare) {
    return <WhoSees audience="coach" coachName={coachName || undefined} note={`Your answers go to ${coachName || 'your coach'}, who sent you the link.`} />;
  }
  return (
    <WhoSees
      plain
      audience={shared ? 'coach' : 'me'}
      coachName={coachName || undefined}
      line={sharingLine(coachName, shared)}
      onChange={(audience) => onShare(audience === 'coach')}
    />
  );
}
