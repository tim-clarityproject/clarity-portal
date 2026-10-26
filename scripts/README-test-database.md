# The test database for The Clarity Portal

The Clarity Portal has two Supabase projects:

- **clarity-portal-fresh** is the live database. Real people's data. Production on Vercel uses it, and nothing here changes it.
- **clarity-portal-test** is the test database. It has the same structure as live, but only invented people and invented data. The branch previews of `feature/performance-overhaul` use it, and so do the testing agents. Every new migration runs here first.

Do the steps below in order. Each one says what a good result looks like. If anything looks different, stop and tell Claude what you saw (but never paste a connection string or password into the chat).

**The secrets stay in your home folder.** The scripts read two private files:

- `~/.clarity-backup.env`: the live connection string (already set up for backups).
- `~/.clarity-test.env`: the test connection string, one line, `DB_URL=postgresql://...`

Both must have permissions 600. The scripts check this, and never print either file.

---

## Step 1. Back up the live database

As always before anything that reads the live database:

1. Open **Terminal** (press Cmd + Space and type "Terminal").
2. Paste this and press Return:

   ```
   cd ~/code/clarity-portal && bash scripts/backup-db.sh
   ```

3. A good result ends with a line like `Backup saved: clarity-2026-10-23-1830.dump (2.4 MB)`.

## Step 2. Copy the structure (not the data) to the test project

In the same Terminal window, paste this and press Return:

```
bash scripts/copy-structure-to-test.sh
```

What it does:

- Checks the test connection string is for clarity-portal-test and the live one is a different project. If not, it stops before connecting to anything.
- Reads the live structure only: tables, policies, functions, triggers, storage buckets and their rules, and extensions. Live is only read, inside read-only transactions, and no rows of data are copied.
- Copies that structure into the test project, all or nothing. If any part fails, the whole copy is undone.
- Compares the two projects.

A good result looks like this (your numbers will differ):

```
Checks passed: the test connection is for clarity-portal-test and live is a different project.
Reading the live structure (read only) ...
Live structure read. Nothing on live was changed.
Copying the structure into the test project ...

               Live   Test   Match
Tables           17     17   ✓
Policies         60     60   ✓
Functions        14     14   ✓
Triggers          6      6   ✓
Buckets           0      0   ✓

Structure copied
```

If the last line starts `Copy failed:`, the rest of the line says why. Send Claude that line and any message above it.

If it says the test project already has tables, see Step 8.

## Step 3. Create the four test accounts

These are invented people. Use only these `example.com` addresses. They can't receive email, so they are never used to test password resets.

| Email | Name | Who they stand for |
|---|---|---|
| coach-owner@example.com | Alex Morgan | The owner coach (stands in for you) |
| coach-two@example.com | Priya Shah | A subcontractor coach, with no owner rights |
| client@example.com | Sam Carter | A coaching client of Alex |
| org-client@example.com | Jordan Lee | A client of Priya, whose coaching is paid for by Northbridge Logistics (an invented company) |

For **each** of the four:

1. Make a new password in your password manager first. Use a different one for each account, and save it there under the email address.
2. Go to supabase.com, sign in and open the **clarity-portal-test** project. Check the name at the top of the page, not clarity-portal-fresh.
3. In the left-hand menu click **Authentication**, then **Users**.
4. Click **Add user** (top right), then **Create new user**.
5. Type the email address, and paste the password from your password manager.
6. Make sure **Auto Confirm User?** is ticked.
7. Click **Create user**. The account appears in the list.

You don't type names anywhere. The data script in Step 4 adds them.

**Note:** The Clarity Portal doesn't yet have coach, owner or organisation links in its database. Every person only sees their own data. So for now, "owner", "subcontractor coach", "client of Alex" and "Northbridge Logistics" only appear as wording in the invented profiles. They don't change what each account can see.

### Save the four sign-ins for the testing agents

The testing agents sign in as these accounts. They read the emails and passwords from a private file in your home folder, `~/.clarity-test-accounts.env`. Make it yourself in Terminal:

1. Create the file, lock it to your user, and open it in TextEdit:

   ```
   touch ~/.clarity-test-accounts.env && chmod 600 ~/.clarity-test-accounts.env && open -e ~/.clarity-test-accounts.env
   ```

2. Type these eight lines. After each `=`, paste that account's email or password with no spaces and no quotes:

   ```
   TEST_COACH_OWNER_EMAIL=coach-owner@example.com
   TEST_COACH_OWNER_PASSWORD=
   TEST_COACH_TWO_EMAIL=coach-two@example.com
   TEST_COACH_TWO_PASSWORD=
   TEST_CLIENT_EMAIL=client@example.com
   TEST_CLIENT_PASSWORD=
   TEST_ORG_CLIENT_EMAIL=org-client@example.com
   TEST_ORG_CLIENT_PASSWORD=
   ```

3. Save (Cmd + S) and close TextEdit.
4. Check the file is locked to your user:

   ```
   stat -f '%Sp' ~/.clarity-test-accounts.env
   ```

   A good result is `-rw-------`. If it shows anything else, run `chmod 600 ~/.clarity-test-accounts.env` and check again.

This file must never be committed, printed or shown in a report. It lives outside the project folder, and the project's `.gitignore` also blocks it in case a copy ever ends up inside.

## Step 4. Add the invented test data

In Terminal, in the project folder, paste this and press Return:

```
bash scripts/seed-test-data.sh
```

It connects only to the test project and checks that before connecting. It finds the four accounts by email and stops if any is missing. Then it adds the data, all or nothing:

- Names and job titles for all four.
- For Sam and Jordan, a few weeks of history:
  - a Personal Operating Plan with two versions and one finished review
  - daily plans for the last two weeks, with day reviews for some of them
  - a meeting plan, an If-Then plan, a Stop Doing audit and a GROW decision
  - after-action reviews, weekly momentum check-ins and daily journals
  - breathing sessions and Wheel of Life check-ins
- For Jordan, a finished Strategic Alignment Health Check for Northbridge Logistics.

Running it again replaces this invented data. It never doubles it.

A good result ends with one line like this:

```
Test data added: profiles 4, plans and decisions 30, reviews 22, daily journals 12, missions 2, plan versions 4, plan reviews 2, breathing sessions 12, Wheel of Life check-ins 4, health checks 1
```

If it ends `Seed failed:`, nothing was added. Send Claude that line and any message above it.

## Step 5. Tell the test project where the previews live

The sign-in emails and links need to know the preview addresses.

1. Find the branch's preview address. In Vercel, open the project and click **Deployments**. Choose the latest deployment of `feature/performance-overhaul`, and look under **Domains**. One address ends in `-git-feature-performance-overhaul-...vercel.app`. Copy that address. It doesn't change between deployments of the branch.
2. In Supabase, open **clarity-portal-test**. Click **Authentication**, then **URL Configuration**.
3. In **Site URL**, paste the branch address, starting `https://`, with nothing after `.vercel.app`. Click **Save**.
4. Under **Redirect URLs**, click **Add URL** and add each of these, one at a time. Replace the example address with the one you copied, and keep the `/**` on the end.
   - `https://clarity-portal-app-git-feature-performance-overhaul-yourteam.vercel.app/**` (your branch address with `/**` added)
   - `http://localhost:5173/**` (local development)
5. Click **Save URLs**.

Do not change anything under Authentication in **clarity-portal-fresh** (live).

## Step 6. Point the branch previews at the test project in Vercel

Only the Preview environment for this one branch changes. **Production must not be touched.**

First, collect two values from the **test** project in Supabase (clarity-portal-test):

- **Project URL**: click **Project Settings** (the cog icon), then **Data API**. It is `https://gqtqljngeenqzxneucoc.supabase.co`.
- **The anon key**: click **Project Settings**, then **API Keys**.
  - Use the same kind of key that Production uses. In Vercel, click the eye icon on Production's `VITE_SUPABASE_ANON_KEY`, just long enough to see how it starts, then hide it again.
  - If it starts `eyJ`, open the **Legacy API Keys** tab and copy the **anon public** key.
  - If it starts `sb_publishable_`, copy the **Publishable key**.
  - **Never** use the `service_role` key or a **Secret key**.

Then, in Vercel:

1. Open the project, click **Settings**, then **Environment Variables**.
2. Look at the list that is already there and note which of these names it has: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
3. For each Supabase name in the table below, add a new variable:
   1. Under **Add New** (or **Create new**), type the **Key**.
   2. Paste the **Value**.
   3. Under **Environments**, tick **Preview** only. Untick **Production** and **Development**.
   4. Next to Preview, choose **Select a custom Preview branch** (or **Preview branch**), and type `feature/performance-overhaul`.
   5. Click **Save**.

   | Key | Value | When |
   |---|---|---|
   | `VITE_SUPABASE_URL` | the test Project URL | always |
   | `VITE_SUPABASE_ANON_KEY` | the test anon key | always |
   | `SUPABASE_URL` | the test Project URL | only if this name was already in the list in point 2 |
   | `SUPABASE_ANON_KEY` | the test anon key | only if this name was already in the list in point 2 |

   The last two matter because the health-check email function prefers `SUPABASE_URL` and `SUPABASE_ANON_KEY` when they exist. If they were already set for Preview, it would otherwise still talk to live.

4. Afterwards, check the list. Each Supabase name should now have an entry for Production (unchanged, live) and a separate entry for Preview on `feature/performance-overhaul` (test). Don't edit or delete the Production entries.

## Step 7. Redeploy the preview and check it

1. In Vercel, click **Deployments**. Open the latest deployment of `feature/performance-overhaul`. Click the **⋯** menu, then **Redeploy**, then **Redeploy** again. Environment variables only take effect on a new deployment.
2. When it shows **Ready**, open the branch address from Step 5.
3. Sign in as `client@example.com` with the password from your password manager.
4. Check:
   - Home greets **Sam**.
   - **My Plans** shows daily plans from the last two weeks, plus "Morrow Cycles kick-off".
   - **My Reviews** shows day reviews, weekly momentum check-ins, after-action reviews, Daily Journal entries and a Wheel of Life check-in.
   - The Personal Operating Plan mission is "Grow Harbour Lane Studio without giving up my evenings".
   - **Nothing from live appears**: no real clients, no plans you recognise, and your own live account doesn't exist here. If you try to sign in with your live email, it should fail.
5. Sign out. If you like, also sign in as `org-client@example.com` and check that Home greets **Jordan**.

### Opening Jordan's health check (optional)

The health check is opened with a link, an email and a 6-character access code. The data script never stores a usable code, so you set one yourself in the **test** project only:

1. In **clarity-portal-test**, click **SQL Editor**, then **New query**.
2. Paste the following. Replace `ABC234` with your own 6 characters. Use capital letters and numbers, but not O, 0, I, 1 or L.

   ```
   update public.alignment_sessions
      set access_code_hash = extensions.crypt('ABC234', extensions.gen_salt('bf')),
          failed_attempts = 0, locked_until = null, link_disabled = false
    where respondent_email = 'org-client@example.com'
   returning '/health-check/' || token as link_path;
   ```

3. Click **Run**. Add the `link_path` shown to the end of the branch address. Open it and enter `org-client@example.com` and your code.

Running the data script again makes a new health check with a new link, so repeat this afterwards.

## Step 8. Starting over

To wipe the test project and rebuild it from live:

1. Back up live (Step 1).
2. Run the copy script with the start-over option:

   ```
   bash scripts/copy-structure-to-test.sh --start-over
   ```

   This empties only the **test** project's public schema (all its tables and the invented data in them), then copies the live structure again. The test accounts stay, because they live in Supabase's own sign-in tables, which are never touched. All of it happens in one transaction. If the copy fails, the test project is left as it was.

3. Run the data script again (Step 4).

To refresh only the invented data, without copying the structure, run the data script again (Step 4).

---

## Not copied yet: the Edge Function and email settings

The copy script doesn't copy these. They need setting up separately before the matching features work in the previews.

- **Edge Function `delete-user`** (`supabase/functions/delete-user/index.ts`). This is the **Delete account** button on My Account. Until it is deployed to clarity-portal-test, that button fails in the previews. Nothing else depends on it. It can be deployed from the project folder with the Supabase command-line tool, `supabase functions deploy delete-user --project-ref gqtqljngeenqzxneucoc`, after `supabase login`. It needs no extra secrets: Supabase gives every function its own project URL and service key.
- **Scheduled jobs**: the code has none, so nothing is needed. If the copy shows that live has the `pg_cron` extension, it is copied as an extension only, with no jobs.
- **Health-check emails** (`api/alignment-email.js` on Vercel). These use `RESEND_API_KEY`, `ALIGNMENT_EMAIL_FROM` and `ALIGNMENT_NOTIFY_TO`. If these are set for Preview, finishing a test health check in a preview sends a real completion email to the `ALIGNMENT_NOTIFY_TO` addresses.
