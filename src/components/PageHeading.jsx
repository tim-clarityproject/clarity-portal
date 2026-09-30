import pageText from '../content/pageText';

export default function PageHeading({ pageKey, title }) {
  const page = pageText[pageKey] || { overline: '', subtitle: '' };
  let { overline, subtitle } = page;

  // Check repetition rule: if any word in overline matches any word in title, hide overline
  if (overline && title) {
    const overlineWords = overline.toLowerCase().split(/\s+/);
    const titleWords = title.toLowerCase().split(/\s+/);

    for (const oWord of overlineWords) {
      for (const tWord of titleWords) {
        // Check if title word starts with overline word (ignoring trailing 's')
        const oWordBase = oWord.replace(/s$/, '');
        const tWordBase = tWord.replace(/s$/, '');

        if (tWordBase.startsWith(oWordBase) && oWordBase.length > 0) {
          // Repetition detected, hide overline
          overline = '';
          subtitle = '';
          break;
        }
      }
      if (!overline) break;
    }
  }

  return (
    <>
      {overline && <div className="ui-overline">{overline}</div>}
      <div className="ui-title">{title}</div>
      {subtitle && <div className="ui-subtitle">{subtitle}</div>}
      {(overline || subtitle) && <div className="ui-rule" />}
    </>
  );
}
