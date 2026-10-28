import { LINE_ICONS } from '../components/design/lineIconDrawings';

// One icon set (Tim, 27 Oct, 23:48): the eye, the i and the Quick guide play
// icon, drawn from the portal's one shared set (src/components/design/
// lineIconDrawings.jsx, which LineIcon uses too) so the Health Check and the portal can never differ. Styled
// by the page's own CSS (svg.ic in hc.css), since this page loads no portal
// styles.

/** @param {{ name: 'eye'|'info'|'play' }} props */
export default function Icon({ name }) {
  return <svg className="ic" viewBox="0 0 16 16" aria-hidden="true" focusable="false">{LINE_ICONS[name]}</svg>;
}
