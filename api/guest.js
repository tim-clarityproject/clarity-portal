// One function for 4 addresses (api/_router.js):
// /api/alignment-email → api/_routes/alignment-email.js
// /api/booking-email → api/_routes/booking-email.js
// /api/guest-copy → api/_routes/guest-copy.js
// /api/agreement-link → api/_routes/agreement-link.js (Phase 6b run 3: a quote's and a sponsor's link pages)
import alignmentEmail from './_routes/alignment-email.js';
import bookingEmail from './_routes/booking-email.js';
import guestCopy from './_routes/guest-copy.js';
import agreementLink from './_routes/agreement-link.js';
import { route } from './_router.js';

export const config = { maxDuration: 60 };

export default route({
  'alignment-email': alignmentEmail,
  'booking-email': bookingEmail,
  'guest-copy': guestCopy,
  'agreement-link': agreementLink,
});
