import pageText from '../content/pageText';

// `overline` and `subtitle` normally come from pageText.js. A page whose
// overline or subtitle depends on the record on screen (a date, a saved
// title) passes it as a prop instead - the repetition rule below still
// applies to it. `rule={false}` is for the tool, summary and hub pages,
// whose mock-ups show no coral rule under the heading: it renders the
// same overline / title / subtitle without the rule.
export default function PageHeading({ pageKey, title, overline: overlineProp, subtitle: subtitleProp, rule = true }) {
  const page = pageText[pageKey] || { overline: '', subtitle: '' };
  let overline = overlineProp !== undefined ? overlineProp : page.overline;
  const subtitle = subtitleProp !== undefined ? subtitleProp : page.subtitle;

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
          // Repetition detected (rule 7: "the overline names the section
          // only... never repeat a word from the title") - hide only the
          // overline. The subtitle is independent page copy, not part of
          // the repetition the rule is guarding against.
          overline = '';
          break;
        }
      }
      if (!overline) break;
    }
  }

  if (!rule) {
    return (
      <>
        {overline && <span className="plan-overline">{overline}</span>}
        <div className="ui-title">{title}</div>
        {subtitle && <p className="ui-subtitle">{subtitle}</p>}
      </>
    );
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
