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
      <span className="dr-small">The floating Breathe button, both styles:</span>
      <div className="dr-row">
        <FloatingOrb placement="inline" style="rings" onBreathe={() => toast.show('Breathe opens here.')} />
        <FloatingOrb placement="inline" style="level" onBreathe={() => toast.show('Breathe opens here.')} />
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
          label={style === 'level' ? 'Breathe in as the level rises, and out as it falls.' : 'Breathe in as the circle grows, and out as it shrinks.'}
        />
        <BreathWords key={`${pattern}-${startedAt}`} pattern={pattern} startedAt={startedAt} />
      </div>
      <span className="dr-small">Sleep wind down: no words, the quieter colours, 4 in and 6 out:</span>
      <BreathOrb style={style} pattern="wind" night size="night" />
    </div>
  );
}
