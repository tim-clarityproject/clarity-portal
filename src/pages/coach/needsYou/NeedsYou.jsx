import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Loading, Row, Rows } from '../../../components/design';
import { supabase } from '../../../lib/supabase';
import { coachZoneOf } from '../../../lib/coach/calendar';
import { rowsOf } from '../../../lib/coach/store';
import { deviceZone } from '../../../lib/time/index.js';
import { EMPTY_LINE, visible } from '../../../lib/agreements/needsYou';
import { needsYouItems } from '../../../lib/agreements/duringAgreement';
import { useCoachPortal } from '../parts';
import { NeedsYouPanel } from './panels';
import './needsyou.css';

// Needs you on Today (Phase 6b run 3, Group D; M28 s-today; risk 11): every drafted next step, above Who needs attention.
// Each line opens its panel (panels.jsx) with the step drafted, and nothing is sent until the coach presses its button;
// Done and Not now leave the list with Undo (065's needs_you_done, so two tabs agree). The items are worked out from
// the coach's own rows (src/lib/agreements/duringAgreement.js, with Group A's words in needsYou.js), in M28's order.
//
// Who needs attention stays coaching facts and the follow-up 5 lines: a reminder whose sending couldn't be confirmed
// (Send again) and an overdue invoice with no reminder waiting. An overdue invoice whose reminder is drafted and
// waiting for Send is here instead, never in both (duringAgreement.overdueInNeedsYou; the lead's line in Today.jsx).
// While only the first screen is here the section waits on its own crosshair: never a 0 or "nothing" (coach rule 49).

const NyTitle = (props) => <h2 {...props} id="ny-title" />;

// Polish 1 (25 Nov): drawn as the reference's card with its rows; `onCount` tells Today's opening line how many there are.
export default function NeedsYou({ todayKey, partial, onCount }) {
  const p = useCoachPortal();
  const navigate = useNavigate();
  const [open, setOpen] = useState(null);
  const [waiting, setWaiting] = useState([]);
  const [fxToday, setFxToday] = useState(null);
  const zone = coachZoneOf(p.settings, deviceZone());
  const agreementsAll = rowsOf(p.state, 'agreements');
  const versionsAll = rowsOf(p.state, 'agreement_versions');
  const foreign = useMemo(() => versionsAll.some((v) => v.coach_id === p.coach.id && (v.terms?.currency || v.currency || 'GBP') !== 'GBP' && v.client_signed_at), [versionsAll, p.coach.id]);

  // The owner's agreements waiting for approval (an associate's are read through 065's owner-only functions).
  useEffect(() => {
    if (!p.isOwner || partial) return undefined;
    let live = true;
    supabase.rpc('agreements_waiting_approval').then(({ data, error }) => { if (live && !error && Array.isArray(data)) setWaiting(data); }).catch(() => {});
    return () => { live = false; };
  }, [p.isOwner, partial, p.now]);
  // Today's reference rates, only when an agreement in another currency is running.
  useEffect(() => {
    if (!foreign || partial) return undefined;
    let live = true;
    supabase.rpc('coach_fx_rates').then(({ data }) => { if (live && data?.rates) setFxToday(data.rates); }).catch(() => {});
    return () => { live = false; };
  }, [foreign, partial]);

  const items = useMemo(() => {
    if (partial) return [];
    const all = needsYouItems({
      coachId: p.coach.id, isOwner: p.isOwner, today: todayKey, now: p.now, zone,
      agreements: agreementsAll, versions: versionsAll, sessions: p.sessions, sources: rowsOf(p.state, 'invoice_sources'),
      agreementReminders: rowsOf(p.state, 'agreement_reminders'), invoices: p.invoices, invoiceReminders: p.invoiceReminders, pauses: p.reminderPauses,
      changeRequests: rowsOf(p.state, 'agreement_change_requests'), entries: rowsOf(p.state, 'time_entries'), clients: p.clients, organisations: p.organisations,
      profiles: rowsOf(p.state, 'org_billing_profiles'), coaches: p.coaches, admin: p.admin,
      allAgreements: waiting.map((w) => ({ id: w.agreement_id, coach_id: w.coach_id, approval: 'waiting', profile_id: w.profile_id || null, updated_at: w.asked_at })),
      allVersions: waiting.map((w) => ({ id: `w:${w.agreement_id}`, agreement_id: w.agreement_id, version: w.version || 1, terms: { coaching: w.coaching } })),
      fxToday,
    });
    // An approval's names come with the owner's own read (the client may be an associate's, not on this device).
    const named = all.map((i) => {
      if (i.kind !== 'approval') return i;
      const w = waiting.find((x) => x.agreement_id === i.data.agreementId);
      return w ? { ...i, title: `${w.coach_name || w.coach_first || 'An associate'} made an agreement for you to approve`, line: `${w.client_name || 'A client'}, ${w.coaching || 'coaching'}` } : i;
    });
    return visible(named, rowsOf(p.state, 'needs_you_done').filter((r) => r.coach_id === p.coach.id), todayKey);
  }, [partial, p.coach.id, p.isOwner, todayKey, p.now, zone, agreementsAll, versionsAll, p.sessions, p.state, p.invoices, p.invoiceReminders, p.reminderPauses, p.clients, p.organisations, p.coaches, p.admin, waiting, fxToday]);

  useEffect(() => { onCount?.(partial ? null : items.length); }, [onCount, partial, items.length]);
  const openItem = (i) => {
    if (i.kind === 'portal') { navigate(`/coach/invoices/${i.data.invoiceId}`); return; }
    setOpen(i);
  };
  return (
    <Card label="Needs you" className="cc-part ny-section" aria-labelledby="ny-title" labelAs={NyTitle}>
      {partial ? <Loading label="Loading what needs you" /> : items.length === 0 ? <p className="cc-quiet">{EMPTY_LINE}</p> : (
        <Rows className="ny-rows">
          {items.map((i) => <Row key={i.key} name={i.title} sub={i.line} value={i.when} onClick={() => openItem(i)} />)}
        </Rows>
      )}
      <NeedsYouPanel item={open} onClose={() => setOpen(null)} />
    </Card>
  );
}
