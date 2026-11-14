import { Timer } from '../../components/design';

// The timer (M9, Get unstuck; Tim, 13 Nov, 09:27): the ring, its button
// and "How long?". In the gallery nobody is signed in, so the length is
// remembered on this device only.
export function TimerDemo() {
  return (
    <div className="dr-stack">
      <Timer />
    </div>
  );
}
