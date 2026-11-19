// The coach portal's screens of Phase 6a run 1 (every M11 screen this run
// builds), and one walk over them: as the owner and as an associate, at
// 1440, 768 and 400, dark and light. Used by the screenshots (shots.mjs)
// and by the UI tester (ui.mjs).
//
// The owner's walk has 049's tables answered by the stand-in (so "Maya's
// client" rows show); the associate's keeps everything on the device, as
// the portal does until 049 has run.
import { chromium } from 'playwright';
import { accountId, APP, clearDevice, coachContext, seedDevice, settle, standIn } from './shared.mjs';
import { ADMIN_ROWS, ID, seedRows } from './seed.mjs';

const click = (name, role = 'button') => async (page) => { await page.getByRole(role, { name, exact: true }).first().click(); await settle(page, 500); };
export const SCREENS = [
  ['today', '/coach'],
  ['today-note', '/coach', async (page) => { await page.locator('.cc-inline-link').first().click(); await settle(page, 600); }],
  ['menu', '/coach', async (page) => { await page.getByRole('button', { name: /^(Open the menu|Menu)$/ }).first().click(); await settle(page, 600); }],
  ['search', '/coach', async (page) => { await page.getByRole('button', { name: 'Search, or do anything' }).click(); await settle(page, 400); }],
  ['search-typed', '/coach', async (page) => { await page.getByRole('button', { name: 'Search, or do anything' }).click(); await page.keyboard.type('sam'); await settle(page, 400); }],
  ['bell', '/coach', async (page) => { await page.getByRole('button', { name: /^Notifications/ }).click(); await settle(page, 600); }],
  ['clients', '/coach/clients'],
  ['clients-board', '/coach/clients', async (page, size) => { if (size === 400) { await click('View')(page); await page.getByRole('menuitemcheckbox', { name: 'Board' }).click(); } else await page.getByRole('button', { name: 'Board', exact: true }).click(); await settle(page, 600); }],
  ['clients-table', '/coach/clients', async (page, size) => { if (size === 400) return 'skip'; await page.getByRole('button', { name: 'Table', exact: true }).click(); await settle(page, 600); return null; }],
  ['clients-table-menu', '/coach/clients', async (page, size) => { if (size === 400) return 'skip'; await page.getByRole('button', { name: 'Table', exact: true }).click(); await settle(page, 400); await page.getByRole('button', { name: 'Sector', exact: true }).click(); await settle(page, 500); return null; }],
  ['clients-filter', '/coach/clients', click('Filter')],
  ['clients-picked', '/coach/clients', async (page, size) => { if (size === 400) return 'skip'; await page.getByRole('checkbox', { name: 'Select Sam Okafor' }).click({ force: true }); await page.getByRole('checkbox', { name: 'Select Leo Grant' }).click({ force: true }); await settle(page, 400); return null; }],
  ['clients-add', '/coach/clients', click('Add client')],
  ['clients-team', '/coach/clients', async (page) => { await click('Add a team')(page); await page.locator('#cc-team-paste').fill('Name,Email,Role\nDana Whitfield,dana@example.invalid,Chief of staff\nSam Again,sam@example.invalid,\nGrace Liu,grace.liu@example.invalid,Partner\nGrace Twice,grace.liu@example.invalid,'); await settle(page, 400); }],
  ['clients-export', '/coach/clients', async (page, size) => { if (size === 400) return 'skip'; await click('Export')(page); return null; }],
  ['clients-groups', '/coach/clients?tab=groups'],
  ['clients-workshops', '/coach/clients?tab=workshops'],
  ['clients-past', '/coach/clients/past'],
  ['client-sam', `/coach/clients/${ID.sam}`],
  ['client-sam-open', `/coach/clients/${ID.sam}`, async (page) => { for (const f of ['Private notes', 'Engagement', 'About Sam', 'Details', 'More']) { await page.getByRole('button', { name: f, exact: true }).click(); await settle(page, 150); } }],
  ['client-sam-everything', `/coach/clients/${ID.sam}`, click('Everything')],
  ['client-leo', `/coach/clients/${ID.leo}`],
  ['client-marcus', `/coach/clients/${ID.marcus}`],
  ['client-priya', `/coach/clients/${ID.priya}`],
  ['client-jordan', `/coach/clients/${ID.jordan}`],
  ['group', `/coach/groups/${ID.group}`],
  ['workshop-next', `/coach/workshops/${ID.wsNext}`],
  ['workshop-past', `/coach/workshops/${ID.wsPast}`],
  ['organisation', `/coach/organisations/${ID.kestrel}`, null, 'owner'],
  ['settings', '/coach/settings'],
  ...['you', 'away', 'notifications', 'booking', 'hours', 'zones', 'calendars', 'tags', 'look'].map((s) => [`settings-${s}`, `/coach/settings/${s}`]),
  ...['email', 'layouts', 'coaches', 'log'].map((s) => [`settings-${s}`, `/coach/settings/${s}`, null, 'owner']),
  ['settings-edit', '/coach/settings/you', async (page) => { await page.getByRole('button', { name: 'Edit Name clients see' }).click(); await settle(page, 300); }],
  ['coming', '/coach/calendar'],
];


/**
 * Opens every screen and hands it to `visit(page, { name, role, size, theme })`.
 * ONLY (a pattern on the screen's name), SIZES, MODES and ROLES narrow it.
 * Resolves the problems met on the way (a screen that didn't open, a page error).
 */
export async function walk(visit, { reducedMotion = 'reduce' } = {}) {
  const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
  const sizes = (process.env.SIZES || '1440,768,400').split(',').map(Number);
  const modes = (process.env.MODES || 'dark,light').split(',');
  const roles = (process.env.ROLES || 'owner,associate').split(',');
  const browser = await chromium.launch();
  const problems = [];
  for (const role of roles) {
    for (const size of sizes) {
      for (const theme of modes) {
        const ctx = await coachContext(browser, { size, theme, reducedMotion });
        const page = await ctx.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e).slice(0, 240)));
        const there = role === 'owner';
        await standIn(page, { role, db: there ? 'there' : 'none', rows: there ? seedRows() : {}, admin: there ? ADMIN_ROWS() : [] });
        await page.goto(`${APP}/coach`);
        await page.waitForSelector('.cc-app', { timeout: 20000 });
        const me = await accountId(page);
        await page.evaluate((t) => localStorage.setItem('clarity-colour-mode', t), theme);
        await clearDevice(page, me);
        if (!there) await seedDevice(page, me, seedRows());
        for (const [name, path, act, forRole] of SCREENS) {
          if (only && !only.test(name)) continue;
          if (forRole && forRole !== role) continue;
          await page.goto(`${APP}${path}`);
          await page.waitForSelector('.cc-app', { timeout: 20000 });
          await settle(page, 900);
          let skipped = null;
          try { if (act) skipped = await act(page, size); } catch (e) { errors.push(`${name}: ${String(e).split('\n')[0].slice(0, 200)}`); }
          if (skipped === 'skip') continue;
          await visit(page, { name, role, size, theme });
        }
        for (const e of new Set(errors)) problems.push(`${role} ${size} ${theme}: ${e}`);
        await clearDevice(page, me);
        await ctx.close();
      }
    }
  }
  await browser.close();
  return problems;
}
