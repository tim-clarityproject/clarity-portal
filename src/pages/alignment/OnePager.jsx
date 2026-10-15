import { useMemo, useState } from 'react';
import AlignmentChart from './AlignmentChart';
import { cleanItems } from './alignmentFlow';
import { quadrant } from './chartLayout';
import { rankProjects, roundPct, MAX_CONTRIBUTION } from '../../lib/alignmentScore';

// The one-pager (everything below the title, which AuthShell draws). All
// numbers come from src/lib/alignmentScore.js.

const pad = (n) => (n < 10 ? `0${n}` : String(n));

const SORTS = [
  { id: 'att', label: 'Most in need of attention' },
  { id: 'imp', label: 'Strategic importance' },
  { id: 'prog', label: 'Progress' },
  { id: 'res', label: 'Resource required' },
];

const VALUE = {
  att: (r) => r.attention,
  imp: (r) => r.importance,
  prog: (r) => (r.progress == null ? -1 : r.progress),
  res: (r) => (r.resource == null ? -1 : r.resource),
};

function EditButton({ label, onClick }) {
  return (
    <button type="button" className="al-edit" aria-label={label} onClick={onClick}>
      Edit
    </button>
  );
}

const Arrow = ({ up }) => (
  <svg className={`al-dir${up ? ' al-dir--up' : ''}`} viewBox="0 0 12 12" aria-hidden="true">
    <path d="M6 1.5v9M2.5 7 6 10.5 9.5 7" />
  </svg>
);

function ProjectCards({ onDownloadPdf, onEmailLink, onCreateAccount, pdf, email }) {
  const [choosing, setChoosing] = useState(false);
  const choose = (variant) => {
    setChoosing(false);
    onDownloadPdf(variant);
  };
  const emailNote = {
    sent: `Sent to ${email.sentTo}`,
    limit: 'You have asked for this a few times already. Please try again tomorrow.',
    error: 'We could not send that just now. Please try again in a moment.',
  }[email.status];
  return (
    <div className="al-keep">
      <span className="al-sect al-sect--first">Keep your results</span>
      <div className="al-kgrid">
        <div className="al-cardwrap">
          <button type="button" className="al-card" aria-expanded={choosing} onClick={() => setChoosing((o) => !o)} disabled={pdf.busy}>
            <span>
              <span className="al-card-name">Download a PDF</span>
              <span className="al-card-desc">
                {pdf.busy ? 'Preparing your PDF…' : 'This one-pager, ready to print or share'}
              </span>
            </span>
            <span className={`ui-cross ui-cross--open${choosing ? ' open' : ''}`} aria-hidden="true" />
          </button>
          {choosing && (
            <div className="al-pdfchoices" role="group" aria-label="PDF version">
              <button type="button" className="al-choice" onClick={() => choose('light')}>Light, for printing</button>
              <button type="button" className="al-choice" onClick={() => choose('dark')}>Dark, for screens</button>
            </div>
          )}
          {pdf.message && <p className="al-cardnote" role="status">{pdf.message}</p>}
        </div>
        <div className="al-cardwrap">
          <button type="button" className="al-card" onClick={onEmailLink} disabled={email.status === 'sending'}>
            <span>
              <span className="al-card-name">Email me a link to this page</span>
              <span className="al-card-desc">
                {email.status === 'sending' ? 'Sending…' : 'So you can find your results again at any time'}
              </span>
            </span>
            <span className="ui-cross" aria-hidden="true" />
          </button>
          {emailNote && (
            <p className={`al-cardnote${email.status === 'sent' ? ' al-cardnote--done' : ''}`} role="status">{emailNote}</p>
          )}
        </div>
        <div className="al-cardwrap">
        <button type="button" className="al-card" onClick={onCreateAccount}>
          <span>
            <span className="al-card-name">Create your account on The Clarity Portal<em>Optional</em></span>
            <span className="al-card-desc">Your own login to The Clarity Portal: daily planning, decision tools and reviews, in one place</span>
          </span>
          <span className="ui-cross" aria-hidden="true" />
        </button>
        </div>
      </div>
    </div>
  );
}

/**
 * @param {Object} props
 * @param {Object} props.draft the shared answers
 * @param {(variant: 'light'|'dark') => void} props.onDownloadPdf
 * @param {{busy: boolean, message: string}} props.pdf
 * @param {{status: 'idle'|'sending'|'sent'|'limit'|'error', sentTo: string}} props.email
 * @param {() => void} props.onEmailLink
 * @param {() => void} props.onCreateAccount
 * @param {(target: 'objective'|'factors'|'projects') => void} props.onEdit the Edit links
 * @param {(projectId: string) => void} props.onOpenProject a table row or dot was chosen
 */
export default function OnePager({ draft, onDownloadPdf, onEmailLink, onCreateAccount, onEdit, onOpenProject, pdf, email }) {
  const [sort, setSort] = useState({ k: 'att', d: -1 });
  const [hl, setHl] = useState(null);

  const factors = useMemo(() => cleanItems(draft.csfs), [draft.csfs]);
  const projects = useMemo(() => cleanItems(draft.projects), [draft.projects]);

  // rank order (attention, ties to the higher importance); n never changes
  const ranked = useMemo(
    () => rankProjects(projects, factors, draft.ratings).map((r, i) => ({
      ...r, id: r.project.id, text: r.project.text, n: i + 1,
    })),
    [projects, factors, draft.ratings],
  );

  const rows = useMemo(() => ranked.slice().sort((a, b) => {
    const diff = sort.d * (VALUE[sort.k](a) - VALUE[sort.k](b));
    if (diff) return diff;
    return (a.n - b.n) * (sort.k === 'att' ? sort.d * -1 : 1);
  }), [ranked, sort]);

  const nf = factors.length;
  const cols = nf <= 1 ? 1 : (nf % 3 === 0 ? 3 : 2);
  const anyRated = ranked.some((r) => r.progress != null);

  const pick = (id) => setSort((o) => ((o.k === id && id !== 'att') ? { k: id, d: -o.d } : { k: id, d: -1 }));
  const activeId = sort.k;
  const word = sort.d < 0 ? 'high to low' : 'low to high';

  const headBtn = (id, text) => (
    <button type="button" className={`al-hb${sort.k === id ? ' al-hb--on' : ''}`} onClick={() => pick(id)}>
      {text}
      {sort.k === id && <Arrow up={sort.d > 0} />}
    </button>
  );

  return (
    <>
      <div className="al-opobj">
        <div className="al-headrow">
          <span className="al-sect0">Objective</span>
          <EditButton label="Edit the objective" onClick={() => onEdit('objective')} />
        </div>
        <p>{draft.objective.trim() || <span className="al-faint">No objective yet</span>}</p>
      </div>

      <div className="al-headrow al-headrow--sect">
        <span className="al-sect al-sect--first">Critical Success Factors</span>
        <EditButton label="Edit the Critical Success Factors" onClick={() => onEdit('factors')} />
      </div>
      <div className="al-csfg" style={{ '--cols': cols }}>
        {factors.map((f, i) => (
          <div key={f.id} className={cols === 2 && nf % 2 === 1 && i === nf - 1 ? 'al-span' : undefined}>
            <b>{pad(i + 1)}</b>
            <span>{f.text}</span>
          </div>
        ))}
      </div>

      {!anyRated ? (
        <p className="al-empty">Your chart appears here once your projects are rated.</p>
      ) : (
        <>
          <span className="al-sect">Strategic importance versus progress</span>
          <div className="al-panel al-chartp">
            <AlignmentChart rows={ranked} highlight={hl} onHighlight={setHl} onOpen={onOpenProject} />
          </div>

          <div className="al-lhead al-headrow">
            <span className="al-sect al-sect--first">Your projects</span>
            <EditButton label="Edit the projects" onClick={() => onEdit('projects')} />
          </div>
          <div className="al-sorts" role="group" aria-label="Sort projects">
            {SORTS.map((f) => {
              const on = activeId === f.id;
              const showArrow = on && f.id !== 'att';
              return (
                <button
                  key={f.id}
                  type="button"
                  className="al-sort"
                  aria-pressed={on}
                  aria-label={showArrow ? `${f.label}, ${word}` : undefined}
                  onClick={() => pick(f.id)}
                >
                  {f.label}
                  {showArrow && <Arrow up={sort.d > 0} />}
                </button>
              );
            })}
          </div>

          <div className={`al-panel al-rk${hl != null ? ' al-hlon' : ''}`}>
            <div className="al-rh">
              <span>No.</span>
              <span>Project</span>
              {headBtn('imp', 'Strategic importance')}
              {headBtn('prog', 'Progress')}
              {headBtn('res', 'Resource required')}
            </div>
            {rows.map((r) => {
              const q = quadrant(r.progress, r.importance);
              return (
                <div
                  key={r.id}
                  className={`al-rr${hl === r.n ? ' al-hl' : ''}`}
                  tabIndex={0}
                  role="button"
                  aria-label={`${r.n}, ${r.text}. Open this project to change its ratings`}
                  onClick={() => onOpenProject(r.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onOpenProject(r.id); } }}
                  onMouseEnter={() => setHl(r.n)}
                  onMouseLeave={() => setHl(null)}
                  onFocus={() => setHl(r.n)}
                  onBlur={() => setHl(null)}
                >
                  <span className={`al-rn al-rn--${q}`}>{r.n}</span>
                  <span className="al-nm">{r.text}</span>
                  <div className="al-c al-ci">
                    <small>Strategic importance</small>
                    <div className="al-ibar">
                      <div className="al-tr"><i style={{ width: `${r.importance.toFixed(1)}%` }} /></div>
                      <span className="al-vv">{roundPct(r.importance)}%</span>
                    </div>
                  </div>
                  <div className="al-c al-cp">
                    <small>Progress</small>
                    <div className="al-segs" aria-label={r.progress == null ? 'Not rated' : `Progress ${r.progress} of 5`}>
                      {[1, 2, 3, 4, 5].map((k) => <i key={k} className={r.progress != null && k <= r.progress ? 'al-f' : undefined} />)}
                    </div>
                  </div>
                  <div className="al-c al-cr">
                    <small>Resource required</small>
                    <div className="al-pips" aria-label={r.resource == null ? 'Not rated' : `Resource required ${r.resource} of 5`}>
                      {[1, 2, 3, 4, 5].map((k) => <i key={k} className={r.resource != null && k <= r.resource ? 'al-f' : undefined} />)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <p className="al-note">
        {`Strategic importance: a project’s contribution scores added together, divided by the highest possible score (${nf} Critical Success Factors × ${MAX_CONTRIBUTION} = ${nf * MAX_CONTRIBUTION}), shown as a percentage. Numbers match the dots on the chart.`}
      </p>

      <ProjectCards onDownloadPdf={onDownloadPdf} onEmailLink={onEmailLink} onCreateAccount={onCreateAccount} pdf={pdf} email={email} />
    </>
  );
}
