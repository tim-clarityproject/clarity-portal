import useColourMode from '../../lib/colourMode/useColourMode';
import { Choice } from './Choice';

const OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'device', label: 'Match my device' },
];

// How the portal looks (design reference v3: Choosing a mode). Lives in
// My Account; Match my device is the starting choice and follows the
// phone or laptop, including switching at night.
export default function ColourModeChoice({ label = 'How should the portal look?' }) {
  const { choice, setChoice } = useColourMode();
  return <Choice label={label} options={OPTIONS} value={choice} onChange={setChoice} />;
}
