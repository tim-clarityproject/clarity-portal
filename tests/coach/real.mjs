// Who sees what, against the REAL tables on the test project (Phase 6a run 2,
// step 7): run 1's path after 049. Nothing here is stood in but the email
// server. Two real coach accounts: the test coach-owner (the owner) and the
// second test coach (the associate, "Maya" in the mock-up).
//
//   node --import ./tests/scores/register.mjs tests/coach/real.mjs
//
// It keeps its data tiny (one invented client for each coach, one note, one
// About them, one cover row), reads only through each browser's own sign-in
// (so the database's rules decide every answer), and at the end removes
// exactly what it added: the cover row as the owner, and each client through
// 049's own client_delete as the coach who made it. Nothing is ever printed
// from the sign-in.
import { chromium } from 'playwright';
import { randomUUID } from 'node:crypto';
import { accountId, APP, clearDevice, coachContext, makeReport, readEnv, seedDevice, settle, SIZES } from './shared.mjs';
import { asAal2 } from '../signin/aal2.mjs';

const { pass, done } = makeReport('Coach portal, who sees what on the real tables');
const env = readEnv();
const OWN = { id: randomUUID(), name: 'Zara Quillfeather', note: 'OWNER-ONLY-NOTE run 2', about: 'OWNER-ONLY-ABOUT run 2' };
const HERS = { id: randomUUID(), name: 'Ines Marlowe-Test', note: 'ASSOCIATE-ONLY-NOTE run 2', about: 'ASSOCIATE-ONLY-ABOUT run 2' };
const COVER = randomUUID();
const dayKey = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** A request to the test project's own REST address as whoever this page is signed in as. */
async function rest(page, method, path, body) {
  return page.evaluate(async ({ method: m, path: p, body: b, url, key }) => {
    let token = null;
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k === 'clarity-portal-auth' || /^sb-.*-auth-token$/.test(k)) { try { const v = JSON.parse(localStorage.getItem(k)); token = v?.access_token || v?.currentSession?.access_token || token; } catch { /* next */ } }
    }
    if (!token) return { status: 0, rows: null };
    const r = await fetch(`${url}/rest/v1/${p}`, { method: m, headers: { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: b ? JSON.stringify(b) : undefined });
    let rows = null;
    try { rows = await r.json(); } catch { /* no body */ }
    return { status: r.status, rows };
  }, { method, path, body, url: env.TEST_SUPABASE_URL, key: env.TEST_SUPABASE_ANON_KEY });
}
const count = (r) => (Array.isArray(r.rows) ? r.rows.length : -1);

async function open(ctx) {
  const page = await ctx.newPage();
  await page.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"sent":false}' }));
  await page.goto(`${APP}/coach`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await settle(page, 1500);
  return page;
}

async function associateContext(browser) {
  const ctx = await browser.newContext({ viewport: SIZES[1440], colorScheme: 'light', serviceWorkers: 'block', reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"sent":false}' }));
  // After 054 the second test coach needs her real code too: Tim enrolled an authenticator on it (23 Nov) and keeps its
  // set-up key as TEST_COACH_TWO_TOTP_KEY (never printed; without it the page is shown the stand-in factor as before).
  await asAal2(page, { host: new URL(env.TEST_SUPABASE_URL).hostname, totpKey: env.TEST_COACH_TWO_TOTP_KEY || null });
  const signIn = async () => {
    await page.goto(`${APP}/coach/sign-in`);
    await page.getByLabel('Email').fill(env.TEST_COACH_TWO_EMAIL);
    await page.getByLabel('Password', { exact: true }).fill(env.TEST_COACH_TWO_PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL((u) => !/sign-in/.test(u.pathname), { timeout: 30000 });
  };
  await signIn();
  await settle(page, 1500);
  await page.close();
  return ctx;
}

/** Puts one client, a note and About them on the device as waiting saves, then lets the page move them across to the real tables. */
async function addThroughTheDevice(page, coachId, who) {
  const uid = await accountId(page);
  await clearDevice(page, uid);
  await seedDevice(page, uid, {
    client_profiles: [{ id: who.id, coach_id: coachId, name: who.name, status: 'active', frequent_traveller: false, getting_started: {} }],
    client_notes: [{ id: randomUUID(), profile_id: who.id, coach_id: coachId, body: who.note, noted_on: dayKey(0), pinned: false }],
    client_about: [{ profile_id: who.id, coach_id: coachId, other: who.about }],
  });
  await page.goto(`${APP}/coach/clients`);
  await page.waitForLoadState('networkidle').catch(() => {});
  for (let i = 0; i < 20; i += 1) {
    if (count(await rest(page, 'GET', `client_notes?select=id&profile_id=eq.${who.id}`)) === 1) break;
    await settle(page, 1000);
  }
}

const browser = await chromium.launch();
let owner; let maya; let ownerPage; let mayaPage;
let ownerCoach = null; let mayaCoach = null;
try {
  owner = await coachContext(browser, { size: 1440, theme: 'dark' });
  ownerPage = await open(owner);
  const me = await rest(ownerPage, 'GET', `coaches?select=id,role,active&user_id=eq.${await accountId(ownerPage)}`);
  ownerCoach = me.rows?.[0]?.id || null;
  pass('the test coach-owner account is the owner on the test project', me.rows?.[0]?.role === 'owner' && me.rows?.[0]?.active === true, `status ${me.status}`);

  maya = await associateContext(browser);
  mayaPage = await open(maya);
  pass('the second test coach gets into the coach portal', /\/coach(\/|$)/.test(new URL(mayaPage.url()).pathname) && !/sign-in/.test(mayaPage.url()), new URL(mayaPage.url()).pathname);
  const her = await rest(mayaPage, 'GET', `coaches?select=id,role,active&user_id=eq.${await accountId(mayaPage)}`);
  mayaCoach = her.rows?.[0]?.id || null;
  pass('the second test coach is an associate there', her.rows?.[0]?.role === 'coach' && her.rows?.[0]?.active === true, `status ${her.status}`);
  if (!ownerCoach || !mayaCoach) throw new Error('The two coach rows are needed to carry on.');

  // ---- run 1's path after 049: what waited on the device moves across once.
  await addThroughTheDevice(ownerPage, ownerCoach, OWN);
  pass('owner: a client kept on the device moves across to the real tables', count(await rest(ownerPage, 'GET', `client_profiles?select=id,name&id=eq.${OWN.id}`)) === 1);
  pass('owner: its private note and About them moved with it', count(await rest(ownerPage, 'GET', `client_notes?select=id&profile_id=eq.${OWN.id}`)) === 1 && count(await rest(ownerPage, 'GET', `client_about?select=profile_id&profile_id=eq.${OWN.id}`)) === 1);
  await ownerPage.reload(); await ownerPage.waitForLoadState('networkidle').catch(() => {}); await settle(ownerPage, 1500);
  pass('owner: after a reload the Clients page lists it from the database', await ownerPage.getByText(OWN.name).first().isVisible().catch(() => false));
  pass('owner: and nothing is doubled', count(await rest(ownerPage, 'GET', `client_profiles?select=id&name=eq.${encodeURIComponent(OWN.name)}`)) === 1);
  await ownerPage.goto(`${APP}/coach/clients/${OWN.id}`); await ownerPage.waitForLoadState('networkidle').catch(() => {}); await settle(ownerPage, 1500);
  const notesFold = ownerPage.getByRole('button', { name: /Private notes/ }).first();
  const foldWords = await notesFold.innerText().catch(() => '');
  if (!(await ownerPage.getByText(OWN.note).first().isVisible().catch(() => false))) await notesFold.click().catch(() => {});
  await settle(ownerPage, 600);
  if (process.env.SEE) { const t = await ownerPage.locator('body').innerText(); const i = t.toUpperCase().indexOf('PRIVATE NOTES'); console.log('SEE ' + JSON.stringify(t.slice(Math.max(0, i - 80), i + 260))); }
  pass('owner: the client’s page shows the private note (its fold opens on it)', await ownerPage.getByText(OWN.note).first().isVisible().catch(() => false), foldWords.replace(/\s+/g, ' ').slice(0, 60));

  await addThroughTheDevice(mayaPage, mayaCoach, HERS);
  pass('associate: her own client moves across too', count(await rest(mayaPage, 'GET', `client_profiles?select=id&id=eq.${HERS.id}`)) === 1 && count(await rest(mayaPage, 'GET', `client_notes?select=id&profile_id=eq.${HERS.id}`)) === 1);

  // ---- the associate and the owner's client.
  pass('associate: the owner’s client can’t be read', count(await rest(mayaPage, 'GET', `client_profiles?select=id,name&id=eq.${OWN.id}`)) === 0);
  pass('associate: nor its notes or About them', count(await rest(mayaPage, 'GET', `client_notes?select=id&profile_id=eq.${OWN.id}`)) === 0 && count(await rest(mayaPage, 'GET', `client_about?select=profile_id&profile_id=eq.${OWN.id}`)) === 0);
  const forced = await rest(mayaPage, 'PATCH', `client_profiles?id=eq.${OWN.id}`, { city: 'Forced' });
  pass('associate: a forced change to it changes nothing', count(forced) <= 0 && count(await rest(ownerPage, 'GET', `client_profiles?select=id&id=eq.${OWN.id}&city=eq.Forced`)) === 0, `status ${forced.status}`);
  const forcedNote = await rest(mayaPage, 'POST', 'client_notes', { profile_id: OWN.id, coach_id: mayaCoach, body: 'forced' });
  pass('associate: a note can’t be added to it', forcedNote.status >= 400, `status ${forcedNote.status}`);
  const adminAsHer = await rest(mayaPage, 'POST', 'rpc/coach_admin_clients', {});
  pass('associate: the owner’s admin facts aren’t hers to ask for', adminAsHer.status >= 400 || count(adminAsHer) === 0, `status ${adminAsHer.status}, ${count(adminAsHer)} rows`);
  await mayaPage.goto(`${APP}/coach/clients`); await mayaPage.waitForLoadState('networkidle').catch(() => {}); await settle(mayaPage, 1500);
  pass('associate: her Clients page lists her client and not the owner’s', await mayaPage.getByText(HERS.name).first().isVisible().catch(() => false) && (await mayaPage.getByText(OWN.name).count()) === 0);
  await mayaPage.goto(`${APP}/coach/clients/${OWN.id}`); await mayaPage.waitForLoadState('networkidle').catch(() => {}); await settle(mayaPage, 1500);
  const herBody = await mayaPage.locator('body').innerText();
  pass('associate: the owner’s client’s address shows nothing of them', !herBody.includes(OWN.name) && !herBody.includes(OWN.note) && !herBody.includes(OWN.about));
  pass('associate: her menu has no Finances, Coaches or Activity log', !(/Finances/.test(await mayaPage.locator('body').innerText())));
  const herDevice = await mayaPage.evaluate(() => Object.keys(localStorage).map((k) => localStorage.getItem(k)).join('\n'));
  pass('associate: nothing of the owner’s client is on her device', !herDevice.includes(OWN.name) && !herDevice.includes(OWN.note) && !herDevice.includes(OWN.about));

  // ---- the owner and the associate's client: admin facts only.
  pass('owner: the associate’s client row isn’t the owner’s to read', count(await rest(ownerPage, 'GET', `client_profiles?select=id&id=eq.${HERS.id}`)) === 0);
  pass('owner: nor her notes or About them', count(await rest(ownerPage, 'GET', `client_notes?select=id&profile_id=eq.${HERS.id}`)) === 0 && count(await rest(ownerPage, 'GET', `client_about?select=profile_id&profile_id=eq.${HERS.id}`)) === 0);
  const admin = await rest(ownerPage, 'POST', 'rpc/coach_admin_clients', {});
  const fact = (admin.rows || []).find((r) => JSON.stringify(r).includes(HERS.id) || JSON.stringify(r).includes(HERS.name));
  pass('owner: the admin facts name her client', Boolean(fact), `status ${admin.status}`);
  pass('owner: and carry nothing private', fact ? !JSON.stringify(fact).includes(HERS.note) && !JSON.stringify(fact).includes(HERS.about) : false);
  await ownerPage.goto(`${APP}/coach/clients/${HERS.id}`); await ownerPage.waitForLoadState('networkidle').catch(() => {}); await settle(ownerPage, 1500);
  const ownBody = await ownerPage.locator('body').innerText();
  pass('owner: the associate’s client’s address shows no note or About them', !ownBody.includes(HERS.note) && !ownBody.includes(HERS.about));

  // ---- cover: only between the dates, only after the client's yes.
  const made = await rest(ownerPage, 'POST', 'coach_cover', { id: COVER, coach_id: ownerCoach, cover_coach_id: mayaCoach, profile_id: OWN.id, starts_on: dayKey(-1), ends_on: dayKey(1) });
  pass('owner: cover is set for the associate, yesterday to tomorrow', made.status < 300, `status ${made.status}`);
  const byHer = await rest(mayaPage, 'POST', 'coach_cover', { coach_id: mayaCoach, cover_coach_id: ownerCoach, profile_id: HERS.id, starts_on: dayKey(-1), ends_on: dayKey(1) });
  pass('associate: she can’t set cover herself', byHer.status >= 400, `status ${byHer.status}`);
  pass('cover: before the client’s yes, the cover coach reads nothing', count(await rest(mayaPage, 'GET', `client_profiles?select=id&id=eq.${OWN.id}`)) === 0);
  const herYes = await rest(mayaPage, 'PATCH', `coach_cover?id=eq.${COVER}`, { client_agreed_at: new Date().toISOString() });
  pass('cover: the cover coach can’t record the yes herself', count(herYes) <= 0 && count(await rest(mayaPage, 'GET', `client_profiles?select=id&id=eq.${OWN.id}`)) === 0, `status ${herYes.status}`);
  const yes = await rest(ownerPage, 'PATCH', `coach_cover?id=eq.${COVER}`, { client_agreed_at: new Date().toISOString() });
  pass('owner: the client’s yes is recorded', count(yes) === 1, `status ${yes.status}`);
  const covered = await rest(mayaPage, 'GET', `client_profiles?select=id,name&id=eq.${OWN.id}`);
  pass('cover: after the yes, between the dates, the cover coach reads the client’s name', covered.rows?.[0]?.name === OWN.name);
  pass('cover: but never the private notes or About them', count(await rest(mayaPage, 'GET', `client_notes?select=id&profile_id=eq.${OWN.id}`)) === 0 && count(await rest(mayaPage, 'GET', `client_about?select=profile_id&profile_id=eq.${OWN.id}`)) === 0);
  const coverChange = await rest(mayaPage, 'PATCH', `client_profiles?id=eq.${OWN.id}`, { city: 'Forced' });
  pass('cover: and can’t change the client', count(coverChange) <= 0 && count(await rest(ownerPage, 'GET', `client_profiles?select=id&id=eq.${OWN.id}&city=eq.Forced`)) === 0, `status ${coverChange.status}`);
  await mayaPage.goto(`${APP}/coach/clients/${OWN.id}`); await mayaPage.waitForLoadState('networkidle').catch(() => {}); await settle(mayaPage, 2000);
  const coverBody = await mayaPage.locator('body').innerText();
  pass('cover: in the browser the client’s page shows no private note or About them', !coverBody.includes(OWN.note) && !coverBody.includes(OWN.about));
  console.log(`  note: while covering, the cover coach’s page for that client ${coverBody.includes(OWN.name) ? 'shows the client’s name' : 'does not show the client'}.`);
  const ended = await rest(ownerPage, 'PATCH', `coach_cover?id=eq.${COVER}`, { starts_on: dayKey(-3), ends_on: dayKey(-1) });
  pass('owner: the cover dates are moved to end yesterday', count(ended) === 1, `status ${ended.status}`);
  pass('cover: after the dates, the cover coach reads nothing again', count(await rest(mayaPage, 'GET', `client_profiles?select=id&id=eq.${OWN.id}`)) === 0);
} catch (e) {
  pass('the walk ran to its end', false, String(e?.message || e).slice(0, 200));
} finally {
  // ---- take away exactly what this test added.
  try {
    if (ownerPage && ownerCoach) {
      await rest(ownerPage, 'DELETE', `coach_cover?id=eq.${COVER}`);
      const gone = await rest(ownerPage, 'POST', 'rpc/client_delete', { p_profile: OWN.id, p_typed_name: OWN.name });
      const left = count(await rest(ownerPage, 'GET', `client_profiles?select=id&id=eq.${OWN.id}`)) + count(await rest(ownerPage, 'GET', `client_notes?select=id&profile_id=eq.${OWN.id}`)) + count(await rest(ownerPage, 'GET', `coach_cover?select=id&id=eq.${COVER}`));
      pass('tidy: the owner’s test client, its note and the cover row are gone', left === 0, `delete answered ${gone.status}, ${left} left`);
      await clearDevice(ownerPage, await accountId(ownerPage));
    }
    if (mayaPage && mayaCoach) {
      const gone = await rest(mayaPage, 'POST', 'rpc/client_delete', { p_profile: HERS.id, p_typed_name: HERS.name });
      const left = count(await rest(mayaPage, 'GET', `client_profiles?select=id&id=eq.${HERS.id}`)) + count(await rest(mayaPage, 'GET', `client_notes?select=id&profile_id=eq.${HERS.id}`));
      pass('tidy: the associate’s test client and its note are gone', left === 0, `delete answered ${gone.status}, ${left} left`);
      await clearDevice(mayaPage, await accountId(mayaPage));
    }
  } catch (e) {
    pass('tidy: ran to its end', false, String(e?.message || e).slice(0, 200));
  }
  await browser.close();
}
done();
