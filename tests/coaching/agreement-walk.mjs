// Signing a coaching agreement and Billing, the client's side (Phase 6b run 1; mock-up M13 A1 to
// A8, with the approved wording's words and the brief's "invest" and "settle"). A walk through
// the real pages in a browser, signed in as the test CLIENT, with every one of migration 061's
// functions and the signatures table answered by a stand-in here: nothing is ever written to a
// database, every other write is stopped and counted, and the walk fails if one was tried.
//
//   node --import ./tests/scores/register.mjs tests/coaching/agreement-walk.mjs [folder for screenshots]
//   PARTS=home,sign,offline,typed,twotabs,funded,billing,before  SIZES=1440,400  MODES=dark,light  narrow it.
//
// Serve the portal first (APP_URL, default http://localhost:4317), pointed at the local stand-in.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { clientContext } from '../coach/client.mjs';
import { APP, makeReport, settle } from '../coach/shared.mjs';

const OUT = process.argv[2] || null;
if (OUT) mkdirSync(OUT, { recursive: true });
const report = makeReport('Agreements, signing and Billing (client)');
const PARTS = (process.env.PARTS || 'home,sign,offline,typed,twotabs,funded,billing,before').split(',');
const SIZES = (process.env.SIZES || '1440,400').split(',').map(Number);
const MODES = (process.env.MODES || 'dark,light').split(',');

const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const toast = async (page) => (await page.locator('.ds-toast-text').last().textContent({ timeout: 6000 }).catch(() => '')) || '';
const shot = async (page, name) => { if (OUT) await page.screenshot({ path: `${OUT}/${name}.png` }); };
const text = (page) => page.evaluate(() => document.body.innerText);
const PRINT = 'a3f1c09e7b2d4e5f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f';

const BEN = {
  coaching: '4-month coaching', sessions: 10, minutes: 60, place: 'Zoom', rhythm: 'every 2 weeks', startsOn: '2026-09-24', endsOn: '2027-01-15',
  currency: 'GBP', total_minor: 200000, instalments: 5, clientName: 'Ben Carter', clientEmail: 'ben@example.invalid', coachName: 'Dr. Tim Dutton', coachFirst: 'Tim',
};
const PRIYA = {
  coaching: '6-month coaching', sessions: 12, minutes: 60, place: 'Zoom', rhythm: 'every 2 weeks', startsOn: '2026-08-27', endsOn: '2027-03-31',
  clientName: 'Priya Shah', clientEmail: 'priya@example.invalid', coachName: 'Dr. Tim Dutton', coachFirst: 'Tim',
};

/** What 061's functions would hold for one client: three versions (1 and 2 signed, 3 waiting) and their invoices. */
function world({ funded = false, missing = false } = {}) {
  const now = Date.now();
  const iso = (ms) => new Date(ms).toISOString();
  const day = (offset) => { const d = new Date(now + offset * 86400000); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
  const terms = funded ? PRIYA : BEN;
  const v = (n, over) => ({
    id: uid(n), agreement_id: uid(100), reference: 'CLARITY-AG-0007', version: n, status: 'superseded', current: false,
    sent_at: iso(now - (40 - n * 10) * 86400000), coach_signed_at: iso(now - (40 - n * 10) * 86400000 - 60000), client_signed_at: iso(now - (39 - n * 10) * 86400000),
    funded_by: funded ? 'Larkfield Health' : null, currency: funded ? null : 'GBP', fx_rate: null, fx_at: null, total_minor: funded ? null : 200000,
    terms, clauses: [], changes: [], signed_name: terms.clientName, signed_email: terms.clientEmail, fingerprint: PRINT, ...over,
  });
  return {
    missing,
    versions: [
      v(3, { status: 'sent', current: true, sent_at: iso(now - 86400000), client_signed_at: null, signed_name: null, signed_email: null, fingerprint: null }),
      v(2, {}),
      v(1, {}),
    ],
    invoices: funded ? [] : [
      { id: uid(43), number: 'CLARITY-1243', status: 'sent', currency: 'GBP', total_minor: 40000, paid_minor: 0, due_on: day(5), issued_on: day(-9), paid_at: null, hosted_url: 'https://invoice.stripe.com/i/test-1243', lines: [], kind: 'instalment' },
      { id: uid(42), number: 'CLARITY-1242', status: 'paid', currency: 'GBP', total_minor: 40000, paid_minor: 40000, due_on: day(-25), issued_on: day(-39), paid_at: iso(now - 26 * 86400000), hosted_url: 'https://invoice.stripe.com/i/test-1242', lines: [], kind: 'instalment' },
      { id: uid(31), number: 'CLARITY-1231', status: 'paid', currency: 'GBP', total_minor: 40000, paid_minor: 40000, due_on: day(-55), issued_on: day(-69), paid_at: iso(now - 56 * 86400000), hosted_url: 'https://invoice.stripe.com/i/test-1231', lines: [], kind: 'instalment' },
    ],
    signatures: [],
    signs: [],
  };
}

/** sign_agreement as 061 answers it, changing `w` as the database would: [status, body]. */
function signIn(w, args) {
  w.signs.push(args);
  const v = w.versions.find((x) => x.id === args.p_version);
  if (!v) return [403, { code: '42501', message: 'That agreement isn’t yours to sign.' }];
  if (v.status === 'signed') return [409, { code: 'CC409', message: 'This agreement is already signed.' }];
  if (args.p_fingerprint !== PRINT) return [409, { code: 'CC409', message: 'This agreement changed since you opened it. Open it again to read the newest version.' }];
  if (!w.signatures.some((s) => s.id === args.p_signature)) return [400, { code: '22023', message: 'Use your signature to sign.' }];
  const at = new Date().toISOString();
  Object.assign(v, { status: 'signed', client_signed_at: at, signed_name: args.p_name.trim(), signed_email: v.terms.clientEmail, fingerprint: PRINT });
  return [200, { signed_at: at, fingerprint: PRINT, version: v.version }];
}
// A signed version's kept PDF (064), as the server keeps it at signing: a stand-in file with its name.
const KEPT_PDF = Buffer.from('%PDF-1.7\n% a stand-in for the signed PDF the server keeps\n%%EOF\n').toString('base64');
const keptName = (v) => `Coaching agreement, ${v.signed_name || v.terms.clientName}, 2 Dec 2026.pdf`;

/** Answers 061 and 064 from `w` (changed as the database and the server would) and stops every other write. */
async function standIn(context, w) {
  const blocked = [];
  await context.route('**/api/**', (r) => {
    const path = new URL(r.request().url()).pathname;
    const body = (() => { try { return r.request().postDataJSON() || {}; } catch { return {}; } })();
    // Follow-up 5: the client's Sign goes through the server, which signs as them and keeps the signed PDF.
    if (path === '/api/agreement-sign' && !w.missing) {
      const [status, answer] = signIn(w, { p_version: body.versionId, p_name: String(body.name || ''), p_signature: body.signatureId, p_fingerprint: body.fingerprint });
      return json(r, status === 200 ? { ok: true, ...answer, pdf: true } : { ok: false, ...answer }, status);
    }
    if (path === '/api/agreement-pdf' && !w.missing) {
      const v = w.versions.find((x) => x.id === body.versionId && x.client_signed_at);
      return v ? json(r, { ok: true, pdf: KEPT_PDF, fileName: keptName(v) }) : json(r, { ok: false, error: 'not_signed' }, 409);
    }
    blocked.push(`api ${path}`);
    return json(r, { ok: true, sent: false });
  });
  await context.route('https://invoice.stripe.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>Stripe invoice</title>' }));
  await context.route('**/rest/v1/**', (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const name = url.pathname.split('/rest/v1/')[1] || '';
    const args = (() => { try { return req.postDataJSON() || {}; } catch { return {}; } })();
    const gone = (fn) => json(route, { code: 'PGRST202', details: null, hint: null, message: `Could not find the function public.${fn} in the schema cache` }, 404);
    if (name.startsWith('rpc/')) {
      const fn = name.slice(4);
      if (fn === 'my_coach') return json(route, [{ coach_id: uid(900), first_name: 'Tim', away_until: null, mobile: null, contact_ways: ['email'] }]);
      if (['my_agreements', 'my_invoices', 'agreement_fingerprint', 'sign_agreement', 'agreement_signed_pdf'].includes(fn) && w.missing) return gone(fn);
      if (fn === 'my_agreements') return json(route, w.versions);
      if (fn === 'my_invoices') return json(route, w.invoices);
      if (fn === 'agreement_fingerprint') return json(route, w.versions.some((x) => x.id === args.p_version) ? PRINT : null);
      if (fn === 'sign_agreement') {
        const [status, answer] = signIn(w, args);
        return json(route, answer, status);
      }
      if (fn === 'agreement_signed_pdf') {
        const v = w.versions.find((x) => x.id === args.p_version);
        if (!v) return json(route, { code: '42501', message: 'That agreement isn’t yours.' }, 403);
        if (!v.client_signed_at) return json(route, { ok: false, error: 'not_signed' });
        return json(route, { ok: true, made: true, pdf: KEPT_PDF, file_name: keptName(v), sha256: 'f'.repeat(64) });
      }
      // The Coaching page's other functions (049 to 051) aren't there: it stays quiet about them.
      if (/^my_|^client_|^cover_/.test(fn)) return gone(fn);
      return json(route, null);
    }
    if (name.startsWith('signatures')) {
      if (w.missing) return json(route, { code: '42P01', message: 'relation "public.signatures" does not exist' }, 404);
      if (req.method() === 'GET') {
        let list = [...w.signatures].sort((a, b) => b.created_at.localeCompare(a.created_at));
        if (url.searchParams.get('kind') === 'eq.drawn') list = list.filter((s) => s.kind === 'drawn');
        const lte = url.searchParams.get('created_at');
        if (lte?.startsWith('lte.')) list = list.filter((s) => s.created_at <= new Date(lte.slice(4)).toISOString());
        return json(route, list.slice(0, Number(url.searchParams.get('limit') || 50)));
      }
      if (req.method() === 'POST') {
        const row = Array.isArray(args) ? args[0] : args;
        if (row.kind === 'drawn' && !(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(row.image) && row.image.length >= 200 && row.image.length <= 300000)) {
          return json(route, { code: '23514', message: 'new row violates check constraint' }, 400);
        }
        const saved = { id: uid(500 + w.signatures.length), kind: row.kind, image: row.image ?? null, typed_name: row.typed_name ?? null, created_at: new Date().toISOString() };
        w.signatures.push(saved);
        // .single() asks for one object.
        return json(route, saved, 201);
      }
    }
    if (['GET', 'HEAD'].includes(req.method())) return route.fallback();
    blocked.push(`${req.method()} ${name.split('?')[0]}`);
    return route.abort('blockedbyclient');
  });
  return { blocked };
}

async function clearDevice(page) {
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (/coaching-agreement|ds-guide:|clarity-queue:/.test(k)) localStorage.removeItem(k);
  });
}

async function draw(page) {
  const box = await page.locator('.ds-sig-canvas').boundingBox();
  await page.mouse.move(box.x + 30, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 24; i += 1) await page.mouse.move(box.x + 30 + i * 9, box.y + box.height / 2 + Math.sin(i / 2) * 22, { steps: 2 });
  await page.mouse.up();
}

async function openSign(page, w) {
  await page.goto(`${APP}/coaching/agreement/${w.versions[0].id}`);
  await page.getByRole('heading', { name: 'Your coaching agreement' }).waitFor({ timeout: 15000 });
}

const browser = await chromium.launch({ args: ['--mute-audio'] });
try {
  for (const size of SIZES) {
    for (const theme of MODES) {
      const tag = `${size}-${theme}`;
      const run = async (part, fn, opts = {}) => {
        if (!PARTS.includes(part)) return;
        const context = await clientContext(browser, { size, theme });
        const w = world(opts);
        const { blocked } = await standIn(context, w);
        const page = await context.newPage();
        try {
          await page.goto(`${APP}/welcome`);
          await clearDevice(page);
          await fn(page, w, context);
        } catch (e) {
          report.pass(`${part} ${tag} ran to the end`, false, e.message.split('\n')[0]);
          await shot(page, `${part}-${tag}-stopped`);
        } finally {
          report.pass(`${part} ${tag}: no other write was tried`, blocked.length === 0, blocked.join(', '));
          await clearDevice(page).catch(() => {});
          await context.close();
        }
      };

      // A1 and A2: Home's row and My coaching's Agreement and More.
      await run('home', async (page) => {
        await page.goto(`${APP}/welcome`);
        await page.getByText('Coaching agreement, version 3').first().waitFor({ timeout: 15000 });
        const home = await text(page);
        report.pass(`home ${tag}: the row's line`, home.includes('Your coaching agreement is ready to sign.'));
        await shot(page, `home-${tag}`);
        await page.getByText('Coaching agreement, version 3').first().click();
        await page.waitForURL(/\/coaching\/agreement\//);
        await page.goto(`${APP}/coaching`);
        await page.getByText('Version 3 of your coaching agreement is ready to sign.').waitFor({ timeout: 15000 });
        const t = await text(page);
        report.pass(`home ${tag}: signed rows`, t.includes('Coaching agreement, version 2') && t.includes('Coaching agreement, version 1') && t.includes('Signed PDF'));
        report.pass(`home ${tag}: More has My signature and Billing`, t.includes('My signature') && t.includes('Billing'));
        report.pass(`home ${tag}: Billing's line`, /Invoice CLARITY-1243 is due on \w{3} \d{1,2} \w{3}\./.test(t), t.match(/Invoice CLARITY-\d+[^\n]*/)?.[0]);
        report.pass(`home ${tag}: one coral button`, (await page.locator('.ds-btn--primary:visible').count()) === 1);
        await shot(page, `mycoaching-${tag}`);
        // A signed version's row downloads its signed PDF, light only (no Light or Dark choice).
        const [download] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.getByText('Coaching agreement, version 2').click()]);
        report.pass(`home ${tag}: the signed PDF's name`, /^Coaching agreement, Ben Carter, .+\.pdf$/.test(download.suggestedFilename()) && !/dark/.test(download.suggestedFilename()), download.suggestedFilename());
        // A7: My signature, with no saved signature yet: the box, Clear and Use this signature, no Type instead.
        await page.getByText('My signature').click();
        await page.getByRole('dialog', { name: 'My signature' }).waitFor();
        const panel = await page.getByRole('dialog', { name: 'My signature' }).innerText();
        report.pass(`home ${tag}: My signature's lines`, panel.includes('It’s used when you sign an agreement.') && panel.includes('We record your full name, the date and the time with it.'));
        report.pass(`home ${tag}: no Type instead in My signature`, !panel.includes('Type instead'));
        await draw(page);
        await page.getByRole('button', { name: 'Use this signature' }).click();
        report.pass(`home ${tag}: saved toast`, (await toast(page)).includes('Saved to your account for next time.'));
        await page.getByText('Draw a new signature').waitFor();
        await shot(page, `mysignature-${tag}`);
      });

      // A3, A4, A5: signing with a drawing, then the saved signature.
      await run('sign', async (page, w) => {
        await openSign(page, w);
        const one = await text(page);
        report.pass(`sign ${tag}: label`, one.includes('Version 3, sent by Tim yesterday'));
        report.pass(`sign ${tag}: Main points with the investment`, one.includes('Your investment') && one.includes('£2,000, in 5 monthly instalments of £400'));
        report.pass(`sign ${tag}: the note under Next`, one.includes('It takes ~5 minutes to read'));
        await shot(page, `sign-1-${tag}`);
        await page.getByRole('button', { name: 'Read the full agreement' }).click();
        const full = page.getByRole('dialog', { name: 'Your coaching agreement' });
        await full.waitFor();
        report.pass(`sign ${tag}: the full agreement, numbered`, (await full.innerText()).includes('1. Purpose'));
        await page.keyboard.press('Escape');
        await settle(page, 500);
        await page.getByRole('button', { name: 'Next' }).click();
        await page.getByRole('heading', { name: 'How would you like to sign?' }).waitFor();
        report.pass(`sign ${tag}: Draw your signature`, (await text(page)).includes('Draw your signature'));
        // Pressed too early: what's missing, under each part, and nothing sent.
        await page.getByRole('button', { name: 'Sign my agreement' }).click();
        const early = await text(page);
        report.pass(`sign ${tag}: says what is missing`, early.includes('Draw your signature to carry on.') && early.includes('Tick the box to carry on.'));
        report.pass(`sign ${tag}: nothing sent too early`, w.signs.length === 0);
        await draw(page);
        await page.getByRole('button', { name: 'Sign my agreement' }).click();
        report.pass(`sign ${tag}: a drawing must be used first`, (await text(page)).includes('Press Use this signature to carry on.'));
        await page.getByRole('button', { name: 'Use this signature' }).click();
        report.pass(`sign ${tag}: saved toast`, (await toast(page)).includes('Saved to your account for next time.'));
        const drawn = w.signatures.find((s) => s.kind === 'drawn');
        report.pass(`sign ${tag}: a PNG within 061's sizes`, Boolean(drawn) && drawn.image.length >= 200 && drawn.image.length <= 300000);
        await page.getByRole('checkbox', { name: 'I’ve read this agreement and I agree to it.' }).click();
        await shot(page, `sign-2-${tag}`);
        await page.getByRole('button', { name: 'Sign with my saved signature' }).click();
        await page.getByRole('heading', { name: 'Thank you, Ben.' }).waitFor({ timeout: 15000 });
        const done = await text(page);
        report.pass(`sign ${tag}: the signed line`, done.includes('Signed. Tim has a copy, and yours is in My Account, Coaching.'));
        report.pass(`sign ${tag}: Signed label`, /Signed \w{3} \d{1,2} \w{3} at \d\d:\d\d/.test(done));
        report.pass(`sign ${tag}: toast Signed`, (await toast(page)).includes('Signed'));
        const call = w.signs[0];
        report.pass(`sign ${tag}: signed with the fingerprint read at opening`, call?.p_fingerprint === PRINT && call?.p_name === 'Ben Carter');
        await shot(page, `sign-3-${tag}`);
        const [download] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.getByRole('button', { name: 'Download PDF' }).click()]);
        report.pass(`sign ${tag}: Download PDF, light only`, /^Coaching agreement, Ben Carter, .+\.pdf$/.test(download.suggestedFilename()), download.suggestedFilename());
        await page.getByRole('button', { name: 'Open My coaching' }).click();
        await page.waitForURL(/\/coaching$/);
        await page.getByText('Coaching agreement, version 3').waitFor({ timeout: 15000 });
        report.pass(`sign ${tag}: no longer waiting`, !(await text(page)).includes('is ready to sign'));
        await page.goto(`${APP}/welcome`);
        await settle(page, 1500);
        report.pass(`sign ${tag}: Home's row gone once signed`, !(await text(page)).includes('Your coaching agreement is ready to sign.'));
      });

      // A4 offline: the error in M13's words; the signature, name and tick are kept.
      await run('offline', async (page, w, context) => {
        await openSign(page, w);
        await page.getByRole('button', { name: 'Next' }).click();
        await draw(page);
        await page.getByRole('button', { name: 'Use this signature' }).click();
        await page.getByRole('checkbox', { name: 'I’ve read this agreement and I agree to it.' }).click();
        await context.setOffline(true);
        await page.getByRole('button', { name: 'Sign with my saved signature' }).click();
        const t = await text(page);
        report.pass(`offline ${tag}: the two lines`, t.includes('That didn’t send, because you’re offline.') && t.includes('Your signature and tick are kept, so try again when you’re back online.'));
        report.pass(`offline ${tag}: tick kept`, (await page.getByRole('checkbox').getAttribute('aria-checked')) === 'true');
        await shot(page, `sign-offline-${tag}`);
        await context.setOffline(false);
        await page.getByRole('button', { name: 'Sign with my saved signature' }).click();
        await page.getByRole('heading', { name: 'Thank you, Ben.' }).waitFor({ timeout: 15000 });
        report.pass(`offline ${tag}: signed once back online`, w.signs.length === 1);
      });

      // Type instead: the name box is the signature.
      await run('typed', async (page, w) => {
        await openSign(page, w);
        await page.getByRole('button', { name: 'Next' }).click();
        await page.getByRole('button', { name: 'Type instead' }).click();
        await page.getByRole('button', { name: 'Draw instead' }).waitFor();
        const name = page.getByLabel('Your full name');
        await name.fill('B');
        await page.getByRole('checkbox', { name: 'I’ve read this agreement and I agree to it.' }).click();
        await page.getByRole('button', { name: 'Sign my agreement' }).click();
        report.pass(`typed ${tag}: a name of 3 or more`, (await text(page)).includes('Type your full name to carry on.'));
        await name.fill('Benjamin Carter');
        await page.getByRole('button', { name: 'Sign my agreement' }).click();
        await page.getByRole('heading', { name: 'Thank you, Benjamin.' }).waitFor({ timeout: 15000 });
        report.pass(`typed ${tag}: a typed signature`, w.signatures.some((s) => s.kind === 'typed' && s.typed_name === 'Benjamin Carter'));
      });

      // Two tabs: the second is told the database's sentence and shows the signed state.
      await run('twotabs', async (page, w, context) => {
        await openSign(page, w);
        const other = await context.newPage();
        await openSign(other, w);
        for (const p of [page, other]) {
          await p.getByRole('button', { name: 'Next' }).click();
          await p.getByRole('button', { name: 'Type instead' }).click();
          await p.getByRole('checkbox', { name: 'I’ve read this agreement and I agree to it.' }).click();
        }
        await page.getByRole('button', { name: 'Sign my agreement' }).click();
        await page.getByRole('heading', { name: 'Thank you, Ben.' }).waitFor({ timeout: 15000 });
        await other.getByRole('button', { name: 'Sign my agreement' }).click();
        report.pass(`twotabs ${tag}: told it's already signed`, (await toast(other)).includes('This agreement is already signed.'));
        await other.getByRole('heading', { name: 'Thank you, Ben.' }).waitFor({ timeout: 15000 });
        report.pass(`twotabs ${tag}: signed once`, w.versions[0].status === 'signed' && w.signs.length === 2);
        await other.close();
      });

      // An organisation-funded client: who funds it, never an amount, no Billing row.
      await run('funded', async (page, w) => {
        await openSign(page, w);
        const t = await text(page);
        const html = await page.content();
        report.pass(`funded ${tag}: Funded by`, t.includes('Funded by') && t.includes('Larkfield Health'));
        report.pass(`funded ${tag}: no money on screen or in the page`, !/£|\$\d|Your investment/.test(t) && !/£|Your investment|total_minor/.test(html));
        await page.goto(`${APP}/coaching`);
        await page.getByText('Version 3 of your coaching agreement is ready to sign.').waitFor({ timeout: 15000 });
        report.pass(`funded ${tag}: no Billing row`, !(await page.getByRole('button', { name: /^Billing/ }).count()));
        await page.goto(`${APP}/coaching/billing`);
        await page.getByText('Larkfield Health funds your coaching.').waitFor({ timeout: 15000 });
        const b = await text(page);
        report.pass(`funded ${tag}: nothing to settle`, b.includes('There’s nothing for you to settle.') && !/£/.test(b));
        await shot(page, `billing-funded-${tag}`);
      }, { funded: true });

      // A8: Billing for a self-funded client.
      await run('billing', async (page, w, context) => {
        await page.goto(`${APP}/coaching/billing`);
        await page.getByRole('heading', { name: /Billing/i }).waitFor({ timeout: 15000 });
        await page.getByText('Invoice CLARITY-1243').waitFor({ timeout: 15000 });
        const t = await text(page);
        report.pass(`billing ${tag}: meta`, t.includes('Invoices from The Clarity Project LTD'));
        report.pass(`billing ${tag}: figures`, t.includes('Next invoice') && t.includes('£400') && /It’s due on \w{3} \d{1,2} \w{3}\./.test(t) && t.includes('Invested so far') && t.includes('£800') && t.includes('£2,000'));
        report.pass(`billing ${tag}: never pay or paid`, !/\b(Pay|Paid|pay|paid)\b/.test(t));
        const settled = page.locator('.billing-settled').first();
        const colour = await settled.evaluate((el) => getComputedStyle(el).color);
        const mint = await page.evaluate(() => getComputedStyle(document.querySelector('.ui-root')).getPropertyValue('--mint-text').trim());
        report.pass(`billing ${tag}: Settled in mint`, Boolean(colour) && Boolean(mint), `${colour} ${mint}`);
        await shot(page, `billing-${tag}`);
        const [popup] = await Promise.all([page.waitForEvent('popup', { timeout: 10000 }), page.getByRole('button', { name: 'Settle my invoice' }).click()]);
        report.pass(`billing ${tag}: Settle opens Stripe's page`, popup.url().startsWith('https://invoice.stripe.com/i/test-1243'), popup.url());
        await popup.close();
        await context.setOffline(true);
        await page.getByRole('button', { name: 'Settle my invoice' }).click();
        const off = await text(page);
        report.pass(`billing ${tag}: offline lines`, off.includes('That didn’t open, because you’re offline.') && off.includes('Try again when you’re back online.'));
        await context.setOffline(false);
      });

      // Before 061 is on the database: everything is quiet.
      await run('before', async (page, w) => {
        await page.goto(`${APP}/coaching`);
        await settle(page, 2500);
        const t = await text(page);
        report.pass(`before ${tag}: no Agreement section`, !t.includes('ready to sign') && !t.includes('Signed PDF'));
        await page.goto(`${APP}/coaching/agreement/${w.versions[0].id}`);
        await page.getByText('This agreement isn’t here any more.').waitFor({ timeout: 15000 });
        report.pass(`before ${tag}: the signing address says so quietly`, true);
      }, { missing: true });
    }
  }
} finally {
  await browser.close();
}
report.done();
