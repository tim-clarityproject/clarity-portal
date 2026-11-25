import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AddButton, Button, ErrorMessage, SlidePanel, TextBox, TextField, useToast } from '../../../components/design';
import { newId, rowsOf, saveRow } from '../../../lib/coach/store';
import { KINDS } from '../../../lib/agreements/terms';
import { moneyText } from '../../../lib/agreements/currency';
import { MOMENTS, pointsFor } from '../../../lib/agreements/talkingPoints';
import { WORDING_NAMES, extrasList, packageRow, standardLine, startPackages } from '../../../lib/coach/agreementBuilder';
import { Part, TextLink, useCoachPortal } from '../parts';
import { Hint, ListRow, MoneyField, SAVE_PROBLEM } from './builderParts';
import './builder.css';

// Settings, Agreements (Phase 6b run 3, Group B; M28 s-packages; brief items 17, 20 and 41): the coach's packages
// (their agreement defaults, edited in the builder; prices also in Finances, Pricing: risk 28), the standard wording for
// each kind, the extras a quote may offer, and the talking points for the moments people go soft on (shown on Needs you
// and on What to say). Packages and the standard wording are the owner's; an associate reads the practice's wording
// and keeps their own extras and talking points.

export default function AgreementSettings() {
  const navigate = useNavigate();
  const { state, isOwner, todayKey } = useCoachPortal();
  const packages = startPackages(rowsOf(state, 'pricing_packages'));
  const standards = rowsOf(state, 'agreement_clause_standards');
  return (
    <div className="ab-settings">
      {isOwner && (
        <Part title="Your packages">
          <div className="ab-rows">
            {packages.map((p) => {
              const row = packageRow(p, { funded: p.agreement_kind === 'team', where: 'settings' });
              return <ListRow key={p.id} title={row.title} line={row.meta} aside="Edit" label={`Edit ${row.title}`} onClick={() => navigate(`/coach/agreements/${p.id}/edit`)} />;
            })}
          </div>
          {packages.length === 0 && <p className="ab-quiet">Your packages are made in Finances, under Pricing.</p>}
          <TextLink onClick={() => navigate('/coach/finances/pricing')}>{packages.length ? 'Prices and packages in Finances' : 'Add a package in Finances'}</TextLink>
        </Part>
      )}
      <Part title="Your standard wording">
        <div className="ab-rows">
          {KINDS.map((k) => (
            <ListRow key={k} title={WORDING_NAMES[k]} line={standardLine(k, standards, todayKey)} aside={isOwner ? 'Edit' : 'Read'} label={`${isOwner ? 'Edit' : 'Read'} ${WORDING_NAMES[k]}`} onClick={() => navigate(`/coach/settings/agreements/wording/${k}`)} />
          ))}
        </div>
      </Part>
      <Extras />
      <TalkingPoints />
    </div>
  );
}

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
  return (
    <Part title="Quote extras">
      <Hint>A quote offers only the extras you add to it in the builder.</Hint>
      <div className="ab-rows">
        {list.map((e) => (
          <div key={e.key} className="ab-line">
            <span className="ab-row-words"><b>{e.title}</b><small>{[moneyText(e.priceMinor, 'GBP'), e.hint].filter(Boolean).join(', ')}</small></span>
            <span className="ab-line-end">
              <TextLink aria-label={`Edit ${e.title}`} onClick={() => { setProblem(null); setEdit({ ...e }); }}>Edit</TextLink>
              <TextLink aria-label={`Remove ${e.title}`} onClick={() => remove(e)}>Remove</TextLink>
            </span>
          </div>
        ))}
      </div>
      <AddButton onClick={() => { setProblem(null); setEdit({ key: null, title: '', priceMinor: 0, hint: '' }); }}>Add extra</AddButton>
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
    </Part>
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
    <Part title="What to say">
      <Hint>Talking points for the moments people go soft on. For you to say, never sent.</Hint>
      <div className="ab-rows">
        {MOMENTS.map((m) => {
          const p = pointsFor(m, rows);
          return <ListRow key={m} title={p.title} line={p.lines[0]?.replace(/\{(month|price|rate|focus)\}/g, '…')} aside="Edit" label={`Edit ${p.title}`} onClick={() => { setProblem(null); setEdit({ moment: m, lines: [...p.lines, '', '', '', '', ''].slice(0, 5), tip: p.tip || '' }); }} />;
        })}
      </div>
      <TextLink onClick={() => navigate('/coach/what-to-say')}>See them all together</TextLink>
      <SlidePanel draftKey={`talking-points:${edit?.moment || 'none'}`} open={Boolean(edit)} onClose={() => setEdit(null)} title={edit ? pointsFor(edit.moment, rows).title : ''}
        footer={<div className="cc-panel-foot cc-panel-foot--end"><Button variant="primary" onClick={save}>Save my edit</Button></div>}>
        {edit && (
          <div className="ab-form">
            {edit.lines.map((l, i) => (
              <TextBox key={`l${i + 1}`} label={i === 0 ? 'What would you say?' : undefined} ariaLabel={i === 0 ? undefined : `Line ${i + 1}`} value={l} maxLength={300}
                onChange={(v) => setEdit({ ...edit, lines: edit.lines.map((x, j) => (j === i ? v : x)) })} />
            ))}
            <Hint>{'{price}, {month}, {rate} and {focus} are filled in on each Needs you item.'}</Hint>
            <TextBox label="What helps you say it?" value={edit.tip} maxLength={300} onChange={(v) => setEdit({ ...edit, tip: v })} />
            {problem && <ErrorMessage>{problem}</ErrorMessage>}
          </div>
        )}
      </SlidePanel>
    </Part>
  );
}
