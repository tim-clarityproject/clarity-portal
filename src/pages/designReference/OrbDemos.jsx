import { useState } from 'react';
import { BreathOrb, BreathWords, FloatingOrb, OrbStyleChoice, SegmentedControl, useOrbStyle, useToast } from '../../components/design';

// The Breathe orb (breathe-orb.html, 29 Oct): Rings and Level in the
// floating button, at Breathe's size with its words, and at night.
export function BreathOrbDemo() {
  const toast = useToast();
  const [style] = useOrbStyle();
  const [pattern, setPattern] = useState('sigh');
  const [startedAt, setStartedAt] = useState(() => performance.now());
  const choose = (p) => {
    setPattern(p);
    setStartedAt(performance.now());
  };
  return (
    <div className="dr-stack">
      <span className="dr-small">The person’s choice, kept on this device for now:</span>
      <OrbStyleChoice />
      <span className="dr-small">The floating Breathe button, under 1024px (one look, whichever orb is chosen):</span>
      <div className="dr-row">
        <FloatingOrb placement="inline" onBreathe={() => toast.show('Breathe opens here.')} />
      </div>
      <span className="dr-small">Breathe, with the words beside the orb:</span>
      <SegmentedControl
        label="Pattern"
        options={[
          { value: 'sigh', label: 'Sigh' },
          { value: 'box', label: 'Box' },
          { value: 'vagal', label: 'Vagal' },
        ]}
        value={pattern}
        onChange={choose}
      />
      <div className="ds-bstage">
        <BreathOrb
          key={`${style}-${pattern}-${startedAt}`}
          style={style}
          pattern={pattern}
          startedAt={startedAt}
          size="tool"
          label="Breathe in as it grows, and out as it shrinks."
        />
        <BreathWords key={`${pattern}-${startedAt}`} pattern={pattern} startedAt={startedAt} name={{ sigh: 'Physiological sigh', box: 'Box breathing', vagal: 'Vagal breathing' }[pattern]} />
      </div>
      <span className="dr-small">Sleep wind down: the same orb in the quieter colours, 4 in and 6 out (the page dims it):</span>
      <BreathOrb style={style} pattern="wind" night size="night" />
    </div>
  );
}
