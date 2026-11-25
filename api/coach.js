// One function for 9 addresses (api/_router.js):
// /api/coach-billing → api/_routes/coach-billing.js
// /api/coach-calendar → api/_routes/coach-calendar.js
// /api/coach-calendar-connect → api/_routes/coach-calendar-connect.js
// /api/coach-send → api/_routes/coach-send.js
// /api/coach-invite → api/_routes/coach-invite.js
// /api/coach-auth-reset → api/_routes/coach-auth-reset.js
// /api/coach-email-in → api/_routes/coach-email-in.js
// /api/agreement-sign → api/_routes/agreement-sign.js (a client signs; the signed PDF is made and kept)
// /api/agreement-pdf → api/_routes/agreement-pdf.js (a signed agreement's kept PDF, for its client or coach)
import coachBilling from './_routes/coach-billing.js';
import coachCalendar from './_routes/coach-calendar.js';
import coachCalendarConnect from './_routes/coach-calendar-connect.js';
import coachSend from './_routes/coach-send.js';
import coachInvite from './_routes/coach-invite.js';
import coachAuthReset from './_routes/coach-auth-reset.js';
import coachEmailIn from './_routes/coach-email-in.js';
import agreementSign from './_routes/agreement-sign.js';
import agreementPdf from './_routes/agreement-pdf.js';
import { route } from './_router.js';

export const config = { maxDuration: 60 };

export default route({
  'coach-billing': coachBilling,
  'coach-calendar': coachCalendar,
  'coach-calendar-connect': coachCalendarConnect,
  'coach-send': coachSend,
  'coach-invite': coachInvite,
  'coach-auth-reset': coachAuthReset,
  'coach-email-in': coachEmailIn,
  'agreement-sign': agreementSign,
  'agreement-pdf': agreementPdf,
});
