import './design.css';

// The label row above a box (M6): the question on the left. Used by
// every box, so the who-sees label can sit at its right.
export default function FieldLabel({ label, id, htmlFor }) {
  if (!label) return null;
  const Tag = htmlFor ? 'label' : 'span';
  return (
    <div className="ds-label-row">
      <Tag id={id} htmlFor={htmlFor} className="ds-label-row-text">{label}</Tag>
    </div>
  );
}
