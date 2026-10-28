import LineIcon from './LineIcon';

// The one "i" (Tim, 23 Oct), drawn from the one icon set (LineIcon; Tim,
// 27 Oct, 23:48): a ring with a plain stem and a dot, in the colour of its
// words. No disc behind it. The button around it gives the 44px tap area;
// the icon itself never grows. Decorative: the button carries the
// accessible name.
export default function InfoIcon() {
  return <LineIcon name="info" className="ds-info" />;
}
