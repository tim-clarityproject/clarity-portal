import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, Loading, PageOpening, Row, Rows, SectionTabs, TextBox, useToast } from '../../../components/design';
import { parseDbTimestamp, getLocalDateKey } from '../../../lib/dateFormatter';
import { dayKeyWords } from '../../../lib/time';
import { BUILDER_LINES } from '../../../content/pageLines/coach';
import { newId, rowsOf, saveRow } from '../../../lib/coach/store';
import { buildClauses, overrideFor, standardClause } from '../../../lib/agreements/clauses';
import { KINDS } from '../../../lib/agreements/terms';
import { WORDING_NAMES, clauseVersions, differsFrom, libraryRows, newStandardRow, sampleTerms, standardsChangedAt, standardsFor } from '../../../lib/coach/agreementBuilder';
import { Back, TextLink, useCoachPortal } from '../parts';
import { Hint, SAVE_PROBLEM, Saved, useAgreementDraft } from './builderParts';
import './builder.css';
import MistakeLine from '../../../components/agreements/MistakeLine';

// The clause library and Edit a clause (Phase 6b run 3, Group B; M28 s-library and s-clause; brief items 15 to 17).
//   /coach/agreements/:id/clauses[/:key]                        an agreement's clauses: edit any just for the client,
//                                                                 or for everyone (a new standard version), or go back
//   /coach/settings/agreements/wording/:kind[/:key] (`standard`)  the coach's standard wording for a kind
// "Use this wording for everyone" adds a new standard version (065: insert only); agreements already sent keep their
// text, and every agreement's own edits stay linked to the standard they changed. Only the owner sets the standard
// (associates use the practice's wording). The reason under a paragraph stays with it, quieter, with no side line.

const toPlaceholders = (paragraphs, t) => paragraphs.map((p) => {
  const swap = (s) => String(s || '')
    .replace(new RegExp(`\\b${t.noticeHours ?? 24} hours`, 'g'), '{noticeHours} hours')
    .replace(new RegExp(`\\b${t.dueDays ?? 14} days`, 'g'), '{dueDays} days');
  return { text: swap(p.text), why: p.why ? swap(p.why) : null };
});

export default function Clauses({ standard = false }) {
  return standard ? <StandardWording /> : <AgreementClauses />;
}

function AgreementClauses() {
  const { id, key } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const d = useAgreementDraft(id);
  const { draft, party, standards, isOwner = d.portal.isOwner, todayKey = d.portal.todayKey } = d;
  if (!draft) {
    return <div className="cc-page"><div className="cc-col"><Back to="Does this read right?" onClick={() => navigate(`/coach/agreements/${id}/edit?q=check`)} />{d.loading ? <Loading label="Loading the agreement" /> : <PageOpening title="The clauses" line="That agreement isn’t here." />}</div></div>;
  }
  const terms = draft.terms || {};
  const overrides = draft.overrides || {};
  const first = party.first || 'them';
  const kind = terms.kind || 'sessions';

  if (key) {
    const clause = buildClauses(terms, { standards, overrides }).find((c) => c.key === key);
    if (!clause) return <div className="cc-page"><div className="cc-col"><Back to="All clauses" onClick={() => navigate(`/coach/agreements/${id}/clauses`)} /><PageOpening title="The clause" line="That clause isn’t in this agreement." /></div></div>;
    const std = standardClause(key, terms, { standards });
    const keep = async (paragraphs) => {
      const next = { ...overrides };
      if (differsFrom(paragraphs, std.paragraphs)) next[key] = overrideFor(key, terms, paragraphs, { standards, title: clause.title });
      else delete next[key];
      const answer = await d.save(terms, { overrides: next, now: true });
      if (answer === 'failed') { toast.error(SAVE_PROBLEM); return false; }
      return true;
    };
    return (
      <ClauseEditor
        key={key} heading={clause.title} who={`Clause ${clause.number}, for ${party.name}`} label={`What should it say for ${first}?`}
        start={clause.paragraphs} standardParagraphs={std.paragraphs} status={d.status}
        editedLine={`Edited for ${first}. Your standard wording stays as it is unless you choose otherwise.`}
        onlyEdited
        back={() => navigate(`/coach/agreements/${id}/clauses`)}
        primary={{
          words: `Just for ${first}`,
          run: async (paragraphs) => {
            const before = overrides;
            if (!(await keep(paragraphs))) return;
            navigate(`/coach/agreements/${id}/clauses`);
            toast.saved({ message: `Kept for ${first} only.`, long: true, onUndo: () => d.save(terms, { overrides: before, now: true }) });
          },
        }}
        everyone={isOwner ? {
          words: 'Yes, for everyone',
          run: async (paragraphs) => {
            const row = newStandardRow({ id: newId(), coachId: d.coach.id, kind, key, title: clause.title, paragraphs: toPlaceholders(paragraphs, terms), standards, fromAgreement: id });
            try { await saveRow(d.userId, 'agreement_clause_standards', row); } catch { toast.error(SAVE_PROBLEM); return; }
            const next = { ...overrides };
            delete next[key];
            await d.save(terms, { overrides: next, now: true });
            navigate(`/coach/agreements/${id}/clauses`);
            const was = standards[key];
            toast.saved({
              message: 'Your standard wording now says this.', long: true,
              // Undo adds the wording that was the standard as its next version (standards are never changed or deleted).
              onUndo: () => saveRow(d.userId, 'agreement_clause_standards', newStandardRow({ id: newId(), coachId: d.coach.id, kind, key, title: clause.title, paragraphs: was?.paragraphs || standardClause(key, { ...terms }, {}).paragraphs, standards: { [key]: { version: row.version } } })),
            });
          },
        } : null}
        reset={{
          words: 'Go back to the standard wording',
          run: async () => {
            const before = overrides;
            const next = { ...overrides };
            delete next[key];
            await d.save(terms, { overrides: next, now: true });
            toast.saved({ message: 'Back to your standard wording.', long: true, onUndo: () => d.save(terms, { overrides: before, now: true }) });
            return std.paragraphs;
          },
        }}
      />
    );
  }

  const rows = libraryRows(terms, { standards, overrides, first, todayKey });
  return (
    <div className="cc-page">
      <div className="cc-col ab-page">
        <Back to="Does this read right?" onClick={() => navigate(`/coach/agreements/${id}/edit?q=check`)} />
        <PageOpening label={party.name} title="Your standard terms" line={isOwner ? BUILDER_LINES.clauses(first) : `Every clause in order. Edit any of them for ${first}.`} />
        <Card label={`${rows.length} clauses`}>
          <Rows>
            {rows.map((r) => <Row key={r.key} name={r.label} sub={r.line} value="Edit" label={`Edit ${r.label}`} onClick={() => navigate(`/coach/agreements/${id}/clauses/${r.key}`)} />)}
          </Rows>
        </Card>
      </div>
    </div>
  );
}

/** A stored time as the day it was on this device: "Thu 12 Nov 2026" (rule 19). */
const dayOf = (stamp) => (stamp ? dayKeyWords(getLocalDateKey(parseDbTimestamp(stamp)), { year: true }) : '');

function StandardWording() {
  const { kind: kindParam, key } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { userId, coach, isOwner, state, todayKey } = useCoachPortal();
  const kind = KINDS.includes(kindParam) ? kindParam : null;
  const rows = rowsOf(state, 'agreement_clause_standards');
  const standards = useMemo(() => standardsFor(rows, kind), [rows, kind]);
  const terms = useMemo(() => sampleTerms(kind || 'sessions', coach), [kind, coach]);
  if (!kind) return <div className="cc-page"><div className="cc-col"><Back to="Agreements" onClick={() => navigate('/coach/settings/agreements')} /><PageOpening title="Your standard terms" line="That wording isn’t here." /></div></div>;
  const list = `/coach/settings/agreements/wording/${kind}`;
  const addVersion = async (k, title, paragraphs, message, undoTo) => {
    const row = newStandardRow({ id: newId(), coachId: coach.id, kind, key: k, title, paragraphs: toPlaceholders(paragraphs, terms), standards });
    try { await saveRow(userId, 'agreement_clause_standards', row); } catch { toast.error(SAVE_PROBLEM); return false; }
    toast.saved({ message, long: true, onUndo: undoTo ? () => saveRow(userId, 'agreement_clause_standards', newStandardRow({ id: newId(), coachId: coach.id, kind, key: k, title, paragraphs: undoTo, standards: { [k]: { version: row.version } } })) : undefined });
    return true;
  };

  if (key) {
    const clause = buildClauses(terms, { standards }).find((c) => c.key === key);
    if (!clause) return <div className="cc-page"><div className="cc-col"><Back to="All clauses" onClick={() => navigate(list)} /><PageOpening title="The clause" line="That clause isn’t in this wording." /></div></div>;
    const code = standardClause(key, terms, {});
    const own = standards[key];
    const versions = clauseVersions(rows, kind, key);
    return (
      <ClauseEditor
        key={key} heading={clause.title} who={`Clause ${clause.number}, ${WORDING_NAMES[kind].toLowerCase()}`} label="What should it say for everyone?"
        start={clause.paragraphs} standardParagraphs={clause.paragraphs} readOnly={!isOwner}
        editedLine="Saving makes a new dated version, used for new agreements only. Agreements already signed keep the version they were signed with."
        note={isOwner ? BUILDER_LINES.solicitor : null}
        versions={versions.map((v) => `Version ${v.version}, ${dayOf(v.created_at)}`).concat(['The first wording'])}
        back={() => navigate(list)}
        primary={isOwner ? {
          words: 'Save for new agreements',
          run: async (paragraphs) => { if (await addVersion(key, clause.title, paragraphs, 'Saved as a new version. New agreements use it.', own?.paragraphs || code.paragraphs)) navigate(list); },
        } : null}
        reset={isOwner && own ? {
          words: 'Go back to the first wording',
          run: async () => { await addVersion(key, clause.title, code.paragraphs, 'Back to the first wording.', own.paragraphs); return code.paragraphs; },
        } : null}
      />
    );
  }
  const lib = libraryRows(terms, { standards, todayKey, standard: true });
  const changed = standardsChangedAt(rows, kind);
  return (
    <div className="cc-page">
      <div className="cc-col ab-page">
        <Back to="Agreements" onClick={() => navigate('/coach/settings/agreements')} />
        <PageOpening label={changed ? `Updated ${dayOf(changed)}` : 'Your first wording'} title="Your standard terms" line={isOwner ? BUILDER_LINES.terms : BUILDER_LINES.termsAssociate} />
        <SectionTabs label="Which agreement" tabs={KINDS.map((k) => ({ key: k, label: WORDING_NAMES[k].replace(/ agreement$/, '') }))} value={kind} onChange={(k) => navigate(`/coach/settings/agreements/wording/${k}`)} />
        <Card label={`${lib.length} clauses`}>
          <Rows>
            {lib.map((r) => {
              const own = standards[r.key];
              return <Row key={r.key} name={r.label} sub={own ? `Version ${own.version}, ${dayOf(own.created_at)}` : 'The first wording'} value={isOwner ? 'Edit' : 'Read'} label={`${isOwner ? 'Edit' : 'Read'} ${r.label}`} onClick={() => navigate(`${list}/${r.key}`)} />;
            })}
          </Rows>
        </Card>
        {isOwner && <Hint>{BUILDER_LINES.solicitor}</Hint>}
      </div>
    </div>
  );
}

/**
 * Edit a clause (M28 s-clause): a box for each paragraph with its reason under it, the line saying it is edited, the
 * choice "Use this wording for everyone from now on?" and Go back to the standard wording.
 */
function ClauseEditor({ heading, who, label, start, standardParagraphs, editedLine, back, primary, everyone = null, reset = null, readOnly = false, status = 'idle', onlyEdited = false, note = null, versions = null }) {
  const [paragraphs, setParagraphs] = useState(() => start.map((p) => ({ text: p.text, why: p.why || null })));
  const [problem, setProblem] = useState(null);
  useEffect(() => { setProblem(null); }, [paragraphs]);
  const differs = differsFrom(paragraphs, standardParagraphs);
  const empty = paragraphs.some((p) => !String(p.text || '').trim());
  // An agreement's clause offers its choices only once it differs from the standard wording (M28 s-clause; UI finding 7).
  const offer = !readOnly && (!onlyEdited || differs);
  const run = (action) => async () => {
    if (empty) { setProblem('Write each paragraph, or go back to the standard wording.'); return; }
    await action.run(paragraphs);
  };
  return (
    <div className="cc-page">
      <div className="cc-col ab-page">
        <Back to="All clauses" onClick={back} />
        <PageOpening label={who} title={heading} line={readOnly ? 'Your practice’s owner sets the standard wording.' : null} aside={status !== 'idle' ? <Saved status={status} /> : null} />
        {paragraphs.map((p, i) => (
          <div key={`p${i + 1}`}>
            {readOnly ? <p className="ab-say">{p.text}</p> : (
              <TextBox label={i === 0 ? label : undefined} ariaLabel={i === 0 ? undefined : `Paragraph ${i + 1}`} value={p.text} maxLength={2000}
                onChange={(v) => setParagraphs((all) => all.map((x, j) => (j === i ? { ...x, text: v } : x)))} />
            )}
            {p.why && <p className="ab-why">{p.why}</p>}
          </div>
        ))}
        {!readOnly && differs && <Hint>{editedLine}</Hint>}
        {problem && <MistakeLine>{problem}</MistakeLine>}
        {offer && primary && everyone && (
          <div className="ab-panel">
            <p className="ab-say">Use this wording for everyone from now on?</p>
            <div className="ab-acts">
              <Button variant="primary" onClick={run(primary)}>{primary.words}</Button>
              <Button variant="outline" onClick={run(everyone)}>{everyone.words}</Button>
            </div>
          </div>
        )}
        {offer && primary && !everyone && <div className="ab-acts"><Button variant="primary" onClick={run(primary)}>{primary.words}</Button></div>}
        {offer && reset && <TextLink onClick={async () => { const back2 = await reset.run(); if (back2) setParagraphs(back2.map((p) => ({ text: p.text, why: p.why || null }))); }}>{reset.words}</TextLink>}
        {note && <Hint>{note}</Hint>}
        {versions && versions.length > 1 && (
          <Card label="Its versions">
            <Rows>{versions.map((v, i) => <Row key={v} name={v} value={i === 0 ? 'Used for new agreements' : undefined} />)}</Rows>
          </Card>
        )}
      </div>
    </div>
  );
}
