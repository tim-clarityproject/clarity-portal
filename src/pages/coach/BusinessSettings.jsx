import { TextField } from '../../components/design';
import { settingsOf, useSaveSettings } from './financeParts';
import { SettingRow, useCoachPortal } from './parts';

// Settings, Business (Polish 1, Stage C; the 25 Nov PDFs, approved by Tim at 16:54): the business's own details that
// every invoice, quotation, agreement and report prints, typed once here and never written into the code. The company's
// name and number and its website go in every PDF's footer; the email in an invoice's From and its remittance line;
// the bank details in an invoice's Payment details. Kept on the owner's finance_settings row (068), the owner's alone.
// Each row saves on its own with Undo (useSaveSettings, as Finances' settings do).

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const editor = (props = {}) => ({ value, setValue, label }) => (
  <TextField label={label} value={value ?? ''} onChange={(e) => setValue(e.target.value)} autoFocus autoComplete="off" {...props} />
);

/** Each detail: its row's label, its column, the box's options, how it's tidied, and what's said when it won't do. */
export const BUSINESS_FIELDS = [
  { key: 'company_name', label: 'Company name', max: 120, tidy: clean },
  { key: 'company_number', label: 'Company number', tidy: (v) => clean(v).replace(/\s/g, '').toUpperCase(), ok: (v) => /^[A-Z0-9]{6,10}$/.test(v),
    problem: 'Type the company number as Companies House shows it, such as 12817337.', input: { inputMode: 'text', placeholder: '12817337' } },
  { key: 'website', label: 'Website', tidy: (v) => clean(v).replace(/^https?:\/\//i, '').replace(/\/+$/, ''), ok: (v) => v.length >= 4 && v.length <= 120 && !/\s/.test(v) && /\./.test(v),
    problem: 'Type the website without spaces, such as theclarityproject.co.uk.', input: { inputMode: 'url', placeholder: 'theclarityproject.co.uk' } },
  { key: 'invoice_email', label: 'Email for invoices', tidy: (v) => clean(v).toLowerCase(), ok: (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) && v.length <= 254,
    problem: 'Type the email with its @, such as accounts@example.com.', input: { type: 'email', inputMode: 'email' } },
  { key: 'bank_name', label: 'Bank', max: 120, tidy: clean, group: 'bank' },
  { key: 'bank_account_name', label: 'Account name', max: 120, tidy: clean, group: 'bank' },
  { key: 'bank_sort_code', label: 'Sort code', group: 'bank',
    tidy: (v) => { const d = clean(v).replace(/\D/g, ''); return d.length === 6 ? `${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4)}` : clean(v); },
    ok: (v) => /^[0-9]{2}-[0-9]{2}-[0-9]{2}$/.test(v), problem: 'Type the six figures of the sort code, such as 00-00-00.', input: { inputMode: 'numeric', placeholder: '00-00-00' } },
  { key: 'bank_account_number', label: 'Account number', group: 'bank', tidy: (v) => clean(v).replace(/\s/g, ''), ok: (v) => /^[0-9]{8}$/.test(v),
    problem: 'Type the eight figures of the account number.', input: { inputMode: 'numeric' } },
];

/** What's said when a detail won't do, or null. An empty box clears it. */
export function businessProblem(field, typed) {
  const v = field.tidy(typed);
  if (!v) return null;
  if (field.max && v.length > field.max) return `Keep it to ${field.max} characters.`;
  return field.ok && !field.ok(v) ? field.problem : null;
}

export default function BusinessSettings() {
  const { coach, financeSettings } = useCoachPortal();
  const saveSettings = useSaveSettings();
  const row = settingsOf(financeSettings, coach.id);
  const one = (f) => {
    const now = row[f.key] || '';
    return (
      <SettingRow
        key={f.key}
        label={f.label}
        value={now}
        words={now || 'Not added yet'}
        editor={editor({ maxLength: f.max || 254, ...(f.input || {}) })}
        check={(v) => businessProblem(f, v)}
        onSave={async (v) => {
          const next = f.tidy(v) || null;
          if (next === (row[f.key] || null)) return;
          const ok = await saveSettings({ [f.key]: next }, 'Saved.');
          if (!ok) throw new Error('That didn’t save. Check your connection and try again.');
        }}
      />
    );
  };
  return (
    <>
      <p className="cc-note">Every invoice, quotation, agreement and report prints these. Your company number goes in each PDF’s footer.</p>
      {BUSINESS_FIELDS.filter((f) => !f.group).map(one)}
      <p className="cc-small-label">Bank details for invoices</p>
      {BUSINESS_FIELDS.filter((f) => f.group === 'bank').map(one)}
      <SettingRow label="VAT" value={row.vat_registered ? 'Registered' : 'Not VAT registered'} still />
      {row.vat_registered && one({ key: 'vat_number', label: 'VAT number', tidy: (v) => clean(v).toUpperCase(), ok: (v) => /^[A-Z]{0,2}[0-9 ]{6,14}$/.test(v),
        problem: 'Type the VAT number as HMRC gives it, such as GB123456789.' })}
    </>
  );
}
