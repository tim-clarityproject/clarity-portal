import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AddLink, Button, Card, Empty, ErrorMessage, QuickAdd, Row, Rows, SlidePanel, TextBox, TextField, useToast } from '../../../components/design';
import { BUILDER_LINES } from '../../../content/pageLines/coach';
import { getLocalDateKey, parseDbTimestamp } from '../../../lib/dateFormatter';
import { dayKeyWords } from '../../../lib/time';
import { clauseKeys } from '../../../lib/agreements/standardWording';
import { newId, rowsOf, saveRow } from '../../../lib/coach/store';
import { blankTerms } from '../../../lib/agreements/terms';
import { moneyText } from '../../../lib/agreements/currency';
import { MOMENTS, pointsFor } from '../../../lib/agreements/talkingPoints';
import { extrasList, packageRow, standardsChangedAt, startPackages } from '../../../lib/coach/agreementBuilder';
import { useCoachPortal } from '../parts';
import { MoneyField, SAVE_PROBLEM } from './builderParts';
import './builder.css';

// Settings, Agreements (Phase 6b run 3, Group B; Polish 1, Stage C: M28 version 6's Packages, as cards; brief items 17,
// 20 and 41): the coach's packages with + Add (a name, then its own questions in focus mode)
// (their agreement defaults, edited in the builder; prices also in Finances, Pricing: risk 28), the standard wording for
// each kind, the extras a quote may offer, and the talking points for the moments people go soft on (shown on Needs you
// and on What to say). Packages and the standard wording are the owner's; an associate reads the practice's wording
// and keeps their own extras and talking points.

export default function AgreementSettings() {
  const navigate = useNavigate();
  const toast = useToast();
  const { state, isOwner, userId, coach } = useCoachPortal();
  const packages = startPackages(rowsOf(state, 'pricing_packages'));
  const standards = rowsOf(state, 'agreement_clause_standards');
  const [adding, setAdding] = useState(false);
  const changed = standardsChangedAt(standards, 'sessions');
  // + Add (M28 version 6's Packages): the name, then the package's own questions, the way a new agreement's run.
  const addPackage = async (name) => {
    const row = { id: newId(), coach_id: coach.id, name: name.slice(0, 120), per: 'month', currency: 'GBP', position: packages.length + 1, agreement_kind: 'sessions',
      defaults: { ...blankTerms('sessions'), priceMode: 'monthly', months: 6, monthlyMinor: 0 }, personal_price_minor: null, archived: false };
    try {
      await saveRow(userId, 'pricing_packages', row);
      navigate(`/coach/agreements/${row.id}/edit?q=mom`);
    } catch { toast.error(SAVE_PROBLEM); }
  };
  return (
    <div className="ab-settings">
      <p className="ab-say ab-settings-line">{BUILDER_LINES.packages}</p>
      {isOwner && (
        <Card label="Your packages" add={<AddLink label="Add package" expanded={adding} onClick={() => setAdding(true)} />}
          quickAdd={<QuickAdd open={adding} onClose={() => setAdding(false)} onAdd={addPackage} placeholder="What’s the package called?" label="Add package" addLabel="Add and set it up" />}>
          {packages.length ? (
            <Rows>
              {packages.map((p) => {
                const row = packageRow(p, { funded: p.agreement_kind === 'team', where: 'settings' });
                const parts = row.meta.split(', ');
                const price = parts.length > 1 ? parts.pop() : row.meta;
                return <Row key={p.id} name={row.title} sub={parts.length && price !== row.meta ? parts.join(', ') : row.short} value={price} label={`Edit ${row.title}`} onClick={() => navigate(`/coach/agreements/${p.id}/edit`)} />;
              })}
            </Rows>
          ) : <Empty action={{ children: 'Add your first package', onClick: () => setAdding(true) }}>You have no packages yet. Each new agreement starts from one.</Empty>}
        </Card>
      )}
      <Card label="Your standard terms" link={{ children: isOwner ? 'View and edit' : 'Read them', onClick: () => navigate('/coach/settings/agreements/wording/sessions') }}>
        <Rows>
          <Row name={`${clauseCount()} clauses`} value={changed ? `Updated ${dayOf(changed)}` : 'Your first wording'} />
        </Rows>
      </Card>
      <Extras />
      <TalkingPoints />
    </div>
  );
}
const clauseCount = () => clauseKeys(blankTerms('sessions')).length;
const dayOf = (stamp) => dayKeyWords(getLocalDateKey(parseDbTimestamp(stamp)));

/** The extras a quote may offer (065's agreement_extras; M28's four until the coach makes their own). */
function Extras() {
  const { userId, coach, state } = useCoachPortal();
  const toast = useToast();
  const rows = rowsOf(state, 'agreement_extras').filter((r) => !r.archived);
  const list = extrasList(rows);
  const [edit, setEdit] = useState(null); // { key, title, priceMinor, hint, isNew }
  const [problem, setProblem] = useState(null);
  const save = async () => {
    const title = String(edit.title || '').trim();
    if (!title) { setProblem('Give the extra a name to carry on.'); return; }
    if (!(edit.priceMinor > 0)) { setProblem('Add its price to carry on.'); return; }
    const key = edit.key || `x${newId().replace(/-/g, '').slice(0, 12)}`;
    // Saving one keeps the whole list as the coach's own (until then it is M28's four).
    const own = rows.length ? [] : list.filter((e) => e.key !== key).map((e, i) => ({ coach_id: coach.id, key: e.key, title: e.title, price_minor: e.priceMinor, currency: 'GBP', hint: e.hint, position: i }));
    const before = rows.find((r) => r.key === key) || null;
    try {
      for (const r of own) await saveRow(userId, 'agreement_extras', { id: newId(), ...r });
      await saveRow(userId, 'agreement_extras', { ...(before || { id: newId(), position: list.length }), coach_id: coach.id, key, title: title.slice(0, 120), price_minor: edit.priceMinor, currency: 'GBP', hint: String(edit.hint || '').trim().slice(0, 120) || null, archived: false });
      setEdit(null);
      toast.saved({ message: before ? 'Saved' : `${title} added`, long: true, onUndo: before ? () => saveRow(userId, 'agreement_extras', before) : undefined });
    } catch { setProblem(SAVE_PROBLEM); }
  };
  const remove = async (e) => {
    const before = rows.find((r) => r.key === e.key);
    try {
      if (before) await saveRow(userId, 'agreement_extras', { ...before, archived: true });
      else for (const [i, x] of list.entries()) await saveRow(userId, 'agreement_extras', { id: newId(), coach_id: coach.id, key: x.key, title: x.title, price_minor: x.priceMinor, currency: 'GBP', hint: x.hint, position: i, archived: x.key === e.key });
      toast.saved({ message: `${e.title} removed`, long: true, onUndo: before ? () => saveRow(userId, 'agreement_extras', before) : undefined });
    } catch { toast.error(SAVE_PROBLEM); }
  };
  const [open, setOpen] = useState(false);
  return (
    <Card label="Quote extras" add={<AddLink label="Add extra" expanded={open} onClick={() => { setProblem(null); setOpen(false); setEdit({ key: null, title: '', priceMinor: 0, hint: '' }); }} />}>
      <Rows>
        {list.map((e) => (
          <Row key={e.key} name={e.title} sub={[moneyText(e.priceMinor, 'GBP'), e.hint].filter(Boolean).join(', ')}
            value={(
              <span className="ab-line-end">
                <button type="button" className="ds-link ab-change" aria-label={`Edit ${e.title}`} onClick={() => { setProblem(null); setEdit({ ...e }); }}>Edit</button>
                <button type="button" className="ds-link ab-change" aria-label={`Remove ${e.title}`} onClick={() => remove(e)}>Remove</button>
              </span>
            )} />
        ))}
      </Rows>
      <SlidePanel draftKey={`agreement-extra:${edit?.key || 'new'}`} open={Boolean(edit)} onClose={() => setEdit(null)} title={edit?.key ? 'Edit extra' : 'Add extra'}
        footer={<div className="cc-panel-foot cc-panel-foot--end"><Button variant="primary" onClick={save}>{edit?.key ? 'Save my edit' : 'Add this extra'}</Button></div>}>
        {edit && (
          <div className="ab-form">
            <TextField label="What is it?" value={edit.title} maxLength={120} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
            <MoneyField label="What’s its price?" value={edit.priceMinor} currency="GBP" onChange={(v) => setEdit({ ...edit, priceMinor: v })} />
            <TextField label="Anything to say about it?" value={edit.hint || ''} maxLength={120} onChange={(e) => setEdit({ ...edit, hint: e.target.value })} />
            {problem && <ErrorMessage>{problem}</ErrorMessage>}
          </div>
        )}
      </SlidePanel>
    </Card>
  );
}

/** The talking points for the five moments (065's talking_points; M28's words until the coach makes them their own). */
function TalkingPoints() {
  const { userId, coach, state } = useCoachPortal();
  const navigate = useNavigate();
  const toast = useToast();
  const rows = rowsOf(state, 'talking_points');
  const [edit, setEdit] = useState(null); // { moment, lines, tip }
  const [problem, setProblem] = useState(null);
  const save = async () => {
    const lines = edit.lines.map((l) => String(l || '').trim()).filter(Boolean).slice(0, 5);
    if (!lines.length) { setProblem('Write at least one line to carry on.'); return; }
    const before = rows.find((r) => r.moment === edit.moment) || null;
    try {
      await saveRow(userId, 'talking_points', { ...(before || { id: newId() }), coach_id: coach.id, moment: edit.moment, lines, tip: String(edit.tip || '').trim().slice(0, 300) || null });
      setEdit(null);
      toast.saved({ message: 'Saved', long: true, onUndo: before ? () => saveRow(userId, 'talking_points', before) : undefined });
    } catch { setProblem(SAVE_PROBLEM); }
  };
  return (
    <Card label="What to say" link={{ children: 'See them all together', onClick: () => navigate('/coach/what-to-say') }}>
      <Rows>
        {MOMENTS.map((m) => {
          const p = pointsFor(m, rows);
          return <Row key={m} name={p.title} sub={p.lines[0]?.replace(/\{(month|price|rate|focus)\}/g, '…')} value="Edit" label={`Edit ${p.title}`} onClick={() => { setProblem(null); setEdit({ moment: m, lines: [...p.lines, '', '', '', '', ''].slice(0, 5), tip: p.tip || '' }); }} />;
        })}
      </Rows>
      <SlidePanel draftKey={`talking-points:${edit?.moment || 'none'}`} open={Boolean(edit)} onClose={() => setEdit(null)} title={edit ? pointsFor(edit.moment, rows).title : ''}
        footer={<div className="cc-panel-foot cc-panel-foot--end"><Button variant="primary" onClick={save}>Save my edit</Button></div>}>
        {edit && (
          <div className="ab-form">
            {edit.lines.map((l, i) => (
              <TextBox key={`l${i + 1}`} label={i === 0 ? 'What would you say?' : undefined} ariaLabel={i === 0 ? undefined : `Line ${i + 1}`} value={l} maxLength={300}
                onChange={(v) => setEdit({ ...edit, lines: edit.lines.map((x, j) => (j === i ? v : x)) })} />
            ))}
            <p className="ab-hint">{'{price}, {month}, {rate} and {focus} are filled in on each Needs you item.'}</p>
            <TextBox label="What helps you say it?" value={edit.tip} maxLength={300} onChange={(v) => setEdit({ ...edit, tip: v })} />
            {problem && <ErrorMessage>{problem}</ErrorMessage>}
          </div>
        )}
      </SlidePanel>
    </Card>
  );
}
