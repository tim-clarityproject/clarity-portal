// One function for 3 addresses (api/_router.js):
// /api/billing-nightly → api/_routes/billing-nightly.js
// /api/coach-reminders → api/_routes/coach-reminders.js
// /api/workshop-emails → api/_routes/workshop-emails.js
import billingNightly from './_routes/billing-nightly.js';
import coachReminders from './_routes/coach-reminders.js';
import workshopEmails from './_routes/workshop-emails.js';
import { route } from './_router.js';

export const config = { maxDuration: 300 };

export default route({
  'billing-nightly': billingNightly,
  'coach-reminders': coachReminders,
  'workshop-emails': workshopEmails,
});
