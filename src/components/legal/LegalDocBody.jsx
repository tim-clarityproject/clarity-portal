// Shared renderer for the structured block content in src/content/legal.js
// (headings, paragraphs, bullet lists), used by both the sign-up reading
// pop-up (ReadingPopup.jsx) and the standalone /legal/* pages
// (LegalDocumentPage.jsx), so the same **bold**/bare-link handling and
// markdown-symbol stripping only has to be written once. Each paragraph's
// raw text is run through the same inline formatter: "**text**" becomes a
// <strong>, the handful of bare emails/domains that appear in the legal
// copy become real links, and a single "\n" (used for short address
// blocks in the source files) becomes a line break - nothing here invents
// or changes a single word of the underlying text.

const INLINE_PATTERN = /\*\*([^*]+)\*\*|([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})|(portal\.theclarityproject\.co\.uk|ico\.org\.uk)/g;

function renderInlineLine(line, keyPrefix, linkClassName) {
  const nodes = [];
  let lastIndex = 0;
  let match;
  let partIndex = 0;

  INLINE_PATTERN.lastIndex = 0;
  while ((match = INLINE_PATTERN.exec(line)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(line.slice(lastIndex, match.index));
    }

    const [whole, bold, email, domain] = match;
    if (bold !== undefined) {
      nodes.push(<strong key={`${keyPrefix}-${partIndex}`}>{bold}</strong>);
    } else if (email !== undefined) {
      nodes.push(
        <a key={`${keyPrefix}-${partIndex}`} className={linkClassName} href={`mailto:${email}`}>
          {email}
        </a>
      );
    } else if (domain !== undefined) {
      nodes.push(
        <a
          key={`${keyPrefix}-${partIndex}`}
          className={linkClassName}
          href={`https://${domain}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {domain}
        </a>
      );
    }

    lastIndex = match.index + whole.length;
    partIndex += 1;
  }

  if (lastIndex < line.length) {
    nodes.push(line.slice(lastIndex));
  }

  return nodes;
}

function renderInlineText(text, keyPrefix, linkClassName) {
  const lines = text.split('\n');
  const nodes = [];
  lines.forEach((line, i) => {
    nodes.push(...renderInlineLine(line, `${keyPrefix}-l${i}`, linkClassName));
    if (i < lines.length - 1) {
      nodes.push(<br key={`${keyPrefix}-br${i}`} />);
    }
  });
  return nodes;
}

// classNames: { heading, paragraph, list, listItem, link }
export default function LegalDocBody({ blocks, classNames }) {
  return blocks.map((block, i) => {
    const key = `block-${i}`;
    if (block.type === 'heading') {
      return (
        <h4 key={key} className={classNames.heading}>
          {renderInlineText(block.text, key, classNames.link)}
        </h4>
      );
    }
    if (block.type === 'list') {
      return (
        <ul key={key} className={classNames.list}>
          {block.items.map((item, j) => (
            <li key={`${key}-${j}`} className={classNames.listItem}>
              {renderInlineText(item, `${key}-${j}`, classNames.link)}
            </li>
          ))}
        </ul>
      );
    }
    return (
      <p key={key} className={classNames.paragraph}>
        {renderInlineText(block.text, key, classNames.link)}
      </p>
    );
  });
}
