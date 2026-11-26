import { dayKeyWords } from '../time/index.js';
import { andList, hoursWords, lowerFirst, moneyText, rateText } from './currency.js';
import { blocksText } from './pricing.js';
import { firstPayment, investmentWords } from './settling.js';
import { kindOf, PLACES, selfFunded } from './terms.js';
import { blockMinutes } from './hours.js';

// The standard wording of every agreement (Phase 6b run 3), version 0 of every clause: the code itself, so the database
// never holds wording (065's agreement_clause_standards keeps only a coach's own later versions). Word for word from
// M28 version 4's STD and clauses(), and from the brief's items 11, 15, 38 and 39 (Tim, 25 Nov), with each agreement's
// notice hours and due days filled in. A paragraph may carry a reason (`why`), shown to the client in a quieter line
// under it, on screen and in the PDF. Clients invest and settle; "pay" never appears (Apple Pay is a product name).
//
// Where M28 draws no wording (a block of hours, a team's sponsor agreement), the paragraphs marked CLAUDE below are
// Claude's, written in the same voice, for Tim to approve (listed in docs/rules/agreements.md).
// Checked by tests/performance/agreements-clauses.test.mjs.

export const PROVIDER = Object.freeze({ name: 'The Clarity Project LTD', number: '12817337' });

const P = (text, why = null) => ({ text, why });
const cur = (t) => t?.currency || 'GBP';
const notice = (t) => Number(t?.noticeHours) || 24;
const due = (t) => Number(t?.dueDays) || 14;
const where = (t) => PLACES[t?.place] || PLACES.zoom;
/** The term in months (M28 version 6: 3, 6 or 12; a package priced as a total keeps its own months too), else 6. */
export const termMonths = (t) => (Number(t?.months) > 0 ? Number(t.months) : 6);
const MONTH_WORDS = { 3: 'three', 6: 'six', 12: 'twelve' };

/** "1 of 90 minutes, then 15 of 60 minutes, on Zoom or in person, weekly for 6 weeks, then every 2 weeks" (M28's sessText). */
export const sessionsText = (t) => `${blocksText(t.blocks)}, ${where(t)}, ${lowerFirst(t.rhythm || 'Every 2 weeks')}`;

// Each clause: its title and paragraphs for these terms. `ctx.choice` is the client's way of settling (the investment
// clause differs between up front and the plan; clauses.js stores both where the client chooses).
export const STANDARD = {
  purpose: (t) => (kindOf(t) === 'team'
    // The sponsor reads a team programme's agreement, so its people are named in the third person (Q9, Polish 1).
    ? {
      title: 'Purpose',
      paragraphs: [
        P('The coaching is here to help each person in the programme perform at their best in a demanding role, and to make real progress on the goals they set in their First check-in.'),
        ...(t.goals ? [P(`The programme’s goals: ${String(t.goals).replace(/\.$/, '')}.`)] : []),
        P('Each person and their coach review these goals together as the coaching goes on, and they can change them at any time.'),
      ],
    }
    : {
      title: 'Purpose',
      paragraphs: [
        P('The coaching is here to help you perform at your best in a demanding role, and to make real progress on the goals you set in your First check-in.'),
        ...(t.goals ? [P(`Your goals: ${String(t.goals).replace(/\.$/, '')}.`)] : []),
        P('You and your coach review these goals together as the coaching goes on, and you can change them at any time.'),
      ],
    }),

  coaching: (t) => {
    const k = kindOf(t);
    if (k === 'oneoff') {
      const on = t.oneoff?.on ? `, on ${dayKeyWords(t.oneoff.on, { year: true })}` : '';
      return { title: 'The work', paragraphs: [P(`${String(t.work || '').replace(/\.$/, '')}${on}, ${t.oneoff?.place === 'inperson' ? 'in person' : 'on Zoom'}.`)] };
    }
    if (k === 'hours') {
      // CLAUDE: M28 draws the block of hours' builder and the client's balance, not its wording.
      return {
        title: 'The work',
        paragraphs: [
          P(`${String(t.hours?.work || t.work || '').replace(/\.$/, '')}.`),
          P('Your coach logs each piece of time with its date and what it was for, and you see a running balance in My Account.'),
          P(t.hours?.owner === 'coach' ? 'Your coach owns the work and licenses it to you.' : 'Once the block is settled, the work is yours.'),
        ],
      };
    }
    const first = k === 'retainer'
      ? P(`You have ${lowerFirst(t.retainer?.sessions || '')}, ${where(t)}, for as long as this agreement runs.`)
      : k === 'team'
        // CLAUDE: the sponsor's agreement names who is coached.
        ? P(`Coaching for ${andList((t.team?.people || []).map((p) => p.name))}: ${t.team?.sessions || ''}, ${where(t)}, ${lowerFirst(t.rhythm || 'Every 2 weeks')}.`)
        : P(`You have ${sessionsText(t)}.`);
    return {
      title: 'The coaching',
      paragraphs: [
        first,
        // Polish 1, Stage C (M28 version 6's "What's included alongside the coaching?"): each can be switched off.
        ...(t.portal !== false ? [P(`The Clarity Portal is included for the length of this agreement, at the ${t.level || 'Executive'} level.`)] : []),
        ...(t.adhoc !== false ? [P('Between coaching sessions you can reach your coach by WhatsApp or Chat in the portal, and they reply within 2 working days.')] : []),
        P('Your coaching sessions are recorded with Fathom to write your session summary, only with your agreement. You can say no at any time, for one coaching session or for all of them.'),
      ],
    };
  },

  investment: (t, ctx = {}) => {
    const k = kindOf(t);
    if (k === 'team') {
      // CLAUDE: the sponsor's agreement says how the organisation is invoiced.
      return {
        title: 'Your investment', money: true,
        paragraphs: [
          P(`Your investment is ${investmentWords(t)}.`),
          P(`Invoices are sent to ${t.team?.invoicesEmail || 'your invoices address'} and are due within ${due(t)} days, settled by bank transfer quoting the invoice number.`),
          ...(t.team?.needsPO ? [P('Each invoice quotes your purchase order number.')] : []),
          P('Travel and other agreed expenses, if any, are invoiced at cost.'),
        ],
      };
    }
    if (!selfFunded(t)) {
      return { title: 'Your investment', money: false, paragraphs: [P(`Your coaching is funded by ${t.fundedBy || t.orgName || 'your organisation'} under a separate agreement, so there is nothing for you to settle.`)] };
    }
    const c = cur(t);
    const choice = ctx.choice ?? t.choice ?? 'upfront';
    return {
      title: 'Your investment', money: true,
      paragraphs: [
        P(`Your investment is ${investmentWords(t, choice)}.`),
        P(`Invoices come from Stripe and are due within ${due(t)} days. You can settle each one by card, Apple Pay or bank transfer, and instalments can be by Direct Debit.`),
        P(`The first ${moneyText(firstPayment(t, choice), c)} is settled when you sign, to confirm your place.`),
        ...(k === 'hours' ? [P(`That is ${hoursWords(blockMinutes(t.hours?.blockMinor, t.hours?.rateMinor))} at ${rateText(Number(t.hours?.rateMinor) || 0, 'hour', c)}.`)] : []),
        ...(t.expenses !== false ? [P('Travel and other agreed expenses, if any, are invoiced at cost.')] : []),
        P('If an invoice is unsettled 14 days after it’s due, your coach may pause new coaching sessions until it’s settled, always after talking to you first.',
          'It’s rare, and it’s always a conversation first.'),
      ],
    };
  },

  rearranging: (t) => ({
    title: 'Rearranging and cancelling',
    paragraphs: [
      P(`You can rearrange or cancel a coaching session at no charge up to ${notice(t)} hours before it starts, from the portal or by letting your coach know.`,
        `Your coaching session is time held only for you, and ${notice(t)} hours lets your coach offer it to someone else.`),
      P(`A coaching session cancelled with less than ${notice(t)} hours’ notice, or missed without notice, counts as used.`,
        'The time can rarely be filled at short notice, so it’s treated the same as a coaching session that happened.'),
      P('If you’re late, the coaching session still ends at its usual time. If your coach is late, you get the full time.',
        'It keeps the next person’s time safe, and your coach holds themselves to the same standard.'),
      P('Your coach can waive any of this when something serious happens, such as illness or a family emergency. Just let them know.',
        'Life happens. The rule is for planning, not for hard moments.'),
      P('If your coach needs to move a coaching session, they offer you a new time, and it’s never counted as used.'),
    ],
  }),

  confidentiality: (t) => ({
    title: 'Confidentiality and records',
    paragraphs: [
      P('What you share in coaching stays between you and your coach.'),
      P('It is not shared with anyone else, including an organisation that funds your coaching, without your agreement.'),
      ...(kindOf(t) === 'team' ? [P('You hear when coaching starts and ends, and how many coaching sessions are used, never what is said.')] : []), // CLAUDE (M28's "What you'll hear")
      P('The only exceptions are where there is a serious risk of harm to you or someone else, or where the law requires it. Your coach would talk to you first wherever they can.'),
      P('Your coach keeps private notes and session summaries for this coaching. Recordings are kept until this agreement ends, then deleted.'),
      P('Your coach may discuss their practice in professional supervision, without naming you.'),
    ],
  }),

  data: () => ({
    title: 'Your data',
    paragraphs: [
      P('The Clarity Portal keeps your data securely, as the privacy notice explains.'),
      P('You choose what your coach sees in the portal, and you can change it any time in My Account.'),
      P('You can download or delete your data at any time. Coaching records such as this agreement and invoices are kept for 6 years after it ends, because UK law requires it.'),
    ],
  }),

  responsibilities: () => ({
    title: 'Responsibilities',
    paragraphs: [
      P('Your coach turns up prepared, keeps to this agreement, and is honest with you, including when coaching isn’t the right support for something.'),
      P('You own your decisions and the actions you take between coaching sessions, and you tell your coach early if something isn’t working.'),
      P('Coaching isn’t therapy, counselling or medical advice. If something would be better helped by another professional, your coach will say so and can suggest someone.'),
    ],
  }),

  ending: (t) => {
    const k = kindOf(t);
    const first = k === 'retainer'
      ? P('This agreement runs in 6-month terms, and renews for another 6 months unless either of you says otherwise at least 30 days before a term ends.')
      : t.fullTerm
        ? P(`This agreement runs for its full ${termMonths(t)} months. If something exceptional happens, talk to your coach and you’ll agree together what’s fair.`,
          `Real change takes steady work over months, so you both commit to the full ${MONTH_WORDS[termMonths(t)] || termMonths(t)}.`)
        : P('Either of you can end this agreement early with 30 days’ notice in writing.',
          'You’re never locked in, and you never invest in coaching you don’t get.');
    return {
      title: 'Ending and changes',
      paragraphs: [
        first,
        // Polish 1, Stage C (M28 version 6's "What happens after the six months?"): only "It renews" changes the wording.
        ...(k === 'sessions' && t.after === 'renew' ? [P(`It then renews for another ${termMonths(t)} months, unless either of you says otherwise at least 30 days before it ends.`)] : []),
        ...(k === 'sessions' ? [P('Coaching sessions not used by the end date expire, unless you agree an extension with your coach.',
          'It keeps momentum: coaching works best at a steady rhythm. Ask early and an extension is usually easy.')] : []),
        P('Any change to this agreement is made as a new version that you both sign. Every version is kept.'),
        P('Your portal account stays open after the agreement ends, so your plans and records stay yours.'),
      ],
    };
  },

  cooling: () => ({
    title: 'Changing your mind in the first 14 days',
    paragraphs: [
      P('You can cancel this agreement within 14 days of signing, for any reason, and get a full refund.'),
      P('If you ask for your coaching to start within those 14 days and then cancel, you’re only charged for the coaching sessions you’ve had.'),
      P('To cancel, tell your coach in writing, by email or in the portal.'),
    ],
  }),

  concerns: () => ({
    title: 'Concerns and law',
    paragraphs: [
      P('If you have a concern, tell your coach first. If it isn’t resolved, you and your coach agree on an independent mediator to help.'),
      P('This agreement is governed by the law of England and Wales.'),
    ],
  }),

  signatures: (t) => ({
    title: 'Signatures',
    paragraphs: [
      P(kindOf(t) === 'team'
        ? `Signed for ${PROVIDER.name} by ${t.coachName || 'your coach'}, then for ${t.orgName || 'your organisation'} by ${t.team?.sponsor?.name || 'you'}.`
        : `Signed for ${PROVIDER.name} by ${t.coachName || 'your coach'}, then by you.`),
      P('The signing record shows each person’s verified email, the date and time, and the document’s fingerprint.'),
    ],
  }),
};

/**
 * Which clauses each kind has, in order (M28's clauses()): a one-off has no Purpose, Responsibilities or Ending; the
 * 14 days only for a self-funded individual; a block of hours no Purpose, Rearranging or Responsibilities (CLAUDE).
 */
export function clauseKeys(t) {
  const k = kindOf(t);
  const cooling = selfFunded(t) && k !== 'team';
  if (k === 'oneoff') return ['coaching', 'investment', 'rearranging', 'confidentiality', 'data', ...(cooling ? ['cooling'] : []), 'concerns', 'signatures'];
  if (k === 'hours') return ['coaching', 'investment', 'confidentiality', 'data', 'ending', ...(cooling ? ['cooling'] : []), 'concerns', 'signatures'];
  return ['purpose', 'coaching', 'investment', 'rearranging', 'confidentiality', 'data', 'responsibilities', 'ending', ...(cooling ? ['cooling'] : []), 'concerns', 'signatures'];
}

/** Every clause key any kind may have (the clause library's list). */
export const ALL_CLAUSE_KEYS = Object.freeze(Object.keys(STANDARD));
