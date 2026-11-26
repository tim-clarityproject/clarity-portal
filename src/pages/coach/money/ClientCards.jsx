import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loading } from '../../../components/design';
import { Card, Empty, Figure, Row, Rows } from '../../../components/design/Blocks';
import { rowsOf } from '../../../lib/coach/store';
import { agreementRows, amountsText, moneySummary } from '../../../lib/coach/money';
import { dayIn, dayKeyWords } from '../../../lib/time/index.js';
import { lengthPlace, whenWords } from '../../../lib/coach/day';
import { useCoachPortal } from '../parts';
import MistakeLine from '../../../components/agreements/MistakeLine';
import './money.css';

// A client's Agreements, Coaching sessions, Money and Contact cards (Polish 1, Stage C, C2; M28 version 6, "client"):
// two columns on a laptop (Agreements and Coaching sessions on the left, Money and Contact on the right), one on a
// phone. Each card is the reference's (Card, Row, Figure, Empty); the words come from src/lib/coach/money.js.
//   Agreements: every agreement with this client, newest first, each with its months, its version and where it stands;
//     a draft opens its builder, one waiting for the client its Sent page, the rest their own page (run 1's open their
//     PDF or text through `onRun1`). View all shows the older ones in place.
//   Coaching sessions: the next one (its brief) and the last one, each with its count; Calendar opens the calendar.
//   Money: what they've settled in all, then each invoice owed (or "Nothing owed"), and who is invoiced for them.
//   Contact: their email and mobile, each opening the app for it.

const FIRST_AGREEMENTS = 3;

export default function ClientCards({ profile, first, next, last, sessions, loading, onBrief, onBook, onRun1, onDetails, whatsapp = null, imessage = null, pdfProblem = null }) {
  const navigate = useNavigate();
  const p = useCoachPortal();
  const { state, agreements = [], agreementVersions = [], invoices = [], todayKey, settings } = p;
  const [allAgreements, setAllAgreements] = useState(false);
  const zone = settings?.time_zone || 'Europe/London';
  const rows = useMemo(() => agreementRows({
    agreements, versions: agreementVersions, quotes: rowsOf(state, 'agreement_quotes'), opens: rowsOf(state, 'agreement_link_opens'), profileId: profile.id, today: todayKey,
  }), [agreements, agreementVersions, state, profile.id, todayKey]);
  const money = useMemo(() => moneySummary({ invoices, agreements, versions: agreementVersions, profileId: profile.id, today: todayKey }), [invoices, agreements, agreementVersions, profile.id, todayKey]);
  const shownAgreements = allAgreements ? rows : rows.slice(0, FIRST_AGREEMENTS);
  const past = profile.status === 'past';
  const held = sessions ? sessions.total - sessions.left : null;
  const countOf = (n) => (sessions && sessions.total > 0 && n > 0 && n <= sessions.total ? `${n} of ${sessions.total}` : null);
  const lastDay = last ? dayKeyWords(dayIn(zone, new Date(last.starts_at)), { year: true, today: todayKey }) : '';
  const open = (r) => (r.run1 ? onRun1?.(r.version) : navigate(r.to));

  return (
    <div className="ds-cols ds-cols--needs-first cc-money-cols">
      <div>
        <Card
          label="Agreements"
          id="cc-money-agreements"
          className="cc-money-agreements"
          link={rows.length > FIRST_AGREEMENTS ? { children: allAgreements ? 'Show fewer' : 'View all', onClick: () => setAllAgreements((v) => !v), 'aria-expanded': allAgreements, 'aria-controls': 'cc-money-agreements' } : undefined}
        >
          {loading ? <Loading label="Loading the agreements" /> : rows.length === 0 ? (
            <Empty action={past ? null : { children: 'New agreement', onClick: () => navigate(`/coach/agreements/new?for=client:${profile.id}`) }}>{`${first} has no agreement yet.`}</Empty>
          ) : (
            <Rows className="cc-money-rows" label={`Agreements with ${first}`}>
              {shownAgreements.map((r) => <Row key={r.id} name={r.name} sub={r.sub} value={r.value} onClick={() => open(r)} label={`${r.name}, ${r.sub}, ${r.value}. Open it`} />)}
            </Rows>
          )}
          {/* A signed PDF that couldn't be had: one mistake line under the agreements it came from (P13). */}
          {!loading && rows.length > 0 && pdfProblem && <MistakeLine>{pdfProblem}</MistakeLine>}
        </Card>
        <Card label="Coaching sessions" className="cc-money-sessions" link={{ children: 'Calendar', onClick: () => navigate('/coach/calendar') }}>
          {!next && !last ? (
            <Empty action={past ? null : { children: 'Book a coaching session', onClick: onBook }}>No coaching session is booked yet.</Empty>
          ) : (
            <Rows>
              {next && <Row name="Next session" sub={`${whenWords(next.starts_at, todayKey)}, ${lengthPlace(next)}`} value={countOf((held ?? 0) + 1)} onClick={() => onBrief(next.id)} label={`Next session, ${whenWords(next.starts_at, todayKey)}. Open the brief`} />}
              {!next && !past && <Row name="No session is booked" sub="Book the next one when it suits." onClick={onBook} label="Book a coaching session" />}
              {last && <Row name="Last session" sub={`${lastDay}, ${lengthPlace(last)}`} value={countOf(held)} onClick={() => navigate(`/coach/sessions/${last.id}`)} label={`Last session, ${lastDay}. Open it`} />}
            </Rows>
          )}
        </Card>
      </div>
      <div>
        <Card label="Money" className="cc-money-money">
          {loading ? <Loading label="Loading the money" /> : (
            <>
              <Figure value={amountsText(money.settled)} unit={money.settled.length ? 'settled in all' : undefined} empty={money.funder ? `${money.funder} is invoiced for the coaching.` : 'Nothing settled yet.'} />
              <Rows>
                {money.owed.map((o) => <Row key={o.id} name={o.name} sub={o.sub} value={o.value} onClick={() => navigate(`/coach/invoices/${o.id}`)} label={`${o.name}, ${o.sub}, ${o.value}. Open it`} />)}
                {money.settledGbp && <Row name="In pounds" value={money.settledGbp} />}
                {money.owed.length === 0 && <Row name="Nothing owed" value="Up to date" />}
                {money.funder && money.settled.length > 0 && <Row name="Invoiced to" value={money.funder} />}
              </Rows>
            </>
          )}
        </Card>
        <Card label="Contact" className="cc-money-contact">
          {!profile.email && !profile.mobile ? (
            <Empty action={{ children: 'Add them in Details', onClick: onDetails }}>{`There’s no email or mobile for ${first} yet.`}</Empty>
          ) : (
            <Rows>
              {profile.email && <Row name={profile.email} href={`mailto:${profile.email}`} label={`Email ${first}`} className="cc-money-contact-row" />}
              {profile.mobile && <Row name={profile.mobile} href={`tel:${String(profile.mobile).replace(/[^\d+]/g, '')}`} label={`Call ${first}`} className="cc-money-contact-row" />}
              {whatsapp && <Row name="Message on WhatsApp" href={whatsapp.href} label={`Message ${first} on WhatsApp`} className="cc-money-contact-row" />}
              {/* iMessage only for a +1 number (coach-portal rule 11; quickContacts). */}
              {imessage && <Row name="Message on iMessage" href={imessage.href} label={`Message ${first} on iMessage`} className="cc-money-contact-row" />}
            </Rows>
          )}
        </Card>
      </div>
    </div>
  );
}
