import { useMemo, useState } from 'react';
import { Choice, PageHeader, SegmentedControl } from '../../components/design';
import { EMAIL_IMAGES, renderEmail } from '../../lib/email/template.js';
import { EMAIL_EXAMPLES } from './examples.js';
import './emailPreview.css';

// The hidden email test page (Tim, 10 Nov): every email the portal sends,
// or will send, as the shared template makes it, with invented people, at
// an inbox's width and a phone's, with its plain-text version underneath.
// Nothing links here, and it exists only in local development and on
// previews (src/main.preview.jsx), never on the live site. It sends
// nothing and reads nothing from the database.
const WIDTHS = [{ value: '600', label: 'Inbox, 600px' }, { value: '375', label: 'Phone, 375px' }];
// The images come from this build's own files here; a sent email carries them inside it.
const image = (key) => EMAIL_IMAGES[key].path;

export default function EmailPreview() {
  const first = new URLSearchParams(window.location.search);
  const [key, setKey] = useState(() => (EMAIL_EXAMPLES.some((e) => e.key === first.get('email')) ? first.get('email') : EMAIL_EXAMPLES[0].key));
  const [width, setWidth] = useState(() => (first.get('width') === '375' ? '375' : '600'));
  const example = EMAIL_EXAMPLES.find((e) => e.key === key);
  const email = useMemo(() => renderEmail(example.doc(), { image }), [example]);

  return (
    <div className="ui-root emailp-page">
      <div className="emailp-in">
        <PageHeader title="Email test page" />
        <div className="emailp-controls">
          <Choice label="Which email" form="dropdown" options={EMAIL_EXAMPLES.map((e) => ({ value: e.key, label: e.name }))} value={key} onChange={setKey} />
          <SegmentedControl label="Width" options={WIDTHS} value={width} onChange={setWidth} />
        </div>
        <dl className="emailp-meta">
          <div><dt>Subject</dt><dd data-email-subject>{email.subject}</dd></div>
          <div><dt>From and to</dt><dd>{example.from}</dd></div>
          <div><dt>When it sends</dt><dd>{example.sends}</dd></div>
        </dl>
        <iframe
          key={`${key}-${width}`}
          className="emailp-frame"
          title={`${example.name}, as an email`}
          style={{ width: `${width}px` }}
          srcDoc={email.html}
          onLoad={(e) => { e.currentTarget.style.height = `${e.currentTarget.contentDocument.documentElement.scrollHeight}px`; }}
        />
        <h2 className="emailp-label">Plain-text version</h2>
        <pre className="emailp-text" data-email-text>{email.text}</pre>
      </div>
    </div>
  );
}
