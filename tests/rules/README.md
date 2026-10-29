# The rules test

`npm run test:rules` checks the database's security rules on the **test** project (clarity-portal-test). For every table and function in `config.mjs`, it acts as each person and checks they can read, add, change and remove only what they should:

- the four test accounts (owner coach, second coach, client, organisation client), and
- someone signed out (the app's public key).

It also checks that nobody can hand their own row to someone else, or point their row at someone else's. Locked tables (only reached through checked functions) must refuse everyone.

## What it needs

- `~/.clarity-test.env` (the test connection string, permissions 600), as for the other test-database scripts. It never reads the live one.
- The four test accounts on the test project (`scripts/README-test-database.md`, step 3). No passwords are used: signing in is done inside the database, the way Supabase does it for the app (the `authenticated` or `anon` role, plus the account's id in `request.jwt.claims`).

## Nothing is kept

Everything runs in one transaction through `scripts/dry-run-on-test.sh`, which always rolls back. Each check also runs in its own sub-transaction that is undone straight away, so the checks can't affect each other. The rows it acts on are made at the start and thrown away at the end.

## Reading the result

- `ALL RULES CHECKS PASSED`: everything matched `config.mjs`. Exit status 0.
- `KNOWN GAP`: a real gap in today's rules, listed in `KNOWN_GAPS`. It is reported every run, but doesn't fail the test until it is fixed.
- `UNEXPECTED`: the database allowed or refused something `config.mjs` says it shouldn't. Exit status 1.
- `KNOWN GAP NO LONGER FOUND`: a gap was fixed, so take it out of `KNOWN_GAPS`. Exit status 1.
- `UNCLEAR`: a check itself went wrong (for example a required column is missing from its `make`). Fix the check.

## Adding a table

Add an entry to `TABLES` in `config.mjs` (or `LOCKED_TABLES` for one nobody reaches directly). It needs:

- `make`, which adds a row for an owner;
- `change`, a harmless edit;
- `handTo`, which would give the row to someone else;
- `owner`, which says whose a row is;
- `access`, only where it isn't "own rows only".

A table whose rows hang off another table (as strategies do off missions) uses `rowOf('missions')` in `make` and is listed after that table. If it's a table people could call through the app's API, list it. Functions go in `FUNCTIONS`.

## Phase 1 (migrations 026 to 032)

`phase1.mjs` holds Phase 1's part: invented people (someone without a coach, a sponsor, a leader over a parent team, a leader over one child team, an organisation admin, someone who has left), made inside the rolled-back transaction with made-up ids, never as real accounts; `SETUP`, which links them (coaches and clients, the organisation's teams, seats, sponsors, leaders, sharing switches, frozen summaries, feedback links with known test links); every new personal table; every new function; and `SCENARIOS`, checks of several steps as different people (switching a part off hides its past; the owner sees admin fields, not personal content; nothing named about a leaver; use figures never for a group under 3 seats; a feedback link refused once expired, switched off or full). `access.mjs` holds the shared answers (OWN, COACH_SEES(part) and the rest) and what each person shares.

Migrations Tim hasn't run on the test database yet run first in the same rolled-back transaction, so the rules are checked as they will be once he has. Since 27 Oct 2026 (024 to 032 run) that is 033 onwards (`FIRST_PENDING` in `run.mjs`). `--as-is` checks the test database exactly as it is.

## Step 4 (migration 033)

The team pulse (results only once closed, with 3 or more answers; the 7-day link; Calm), wellbeing shared per organisation, and the fixed 85% standard for organisation seats each have scenarios in `phase1.mjs`, and the new table and functions are in its lists.

## Adding a role (Phase 1: sponsor, viewer, organisation admin)

1. Make the test account on the test project, as in step 3 of `scripts/README-test-database.md`.
2. Add it to `PEOPLE`.
3. Add how it is linked to others to `RELATIONSHIPS` (for example `{ from: 'owner_coach', kind: 'coach of', to: 'client' }`). The test data that makes the link in the database goes in the seed script.
4. Write the new answers next to `OWN` and use them in `access`, for example:

   ```js
   ownOrCoach: ({ viewer, owner, related }) => OWN({ viewer, owner }) || related('coach of')
   ```

Every table and function is then checked for the new role automatically.

## Seeing the SQL

`node tests/rules/run.mjs --sql` writes the SQL it would run to a temporary file and prints where, without running it.

## Step 5 (migration 035): guest links

`guests.mjs` holds the guest part: one more invented person (someone who used a guest link and later makes an account with the same, confirmed email), invented guests with no account made in `GUEST_SETUP` with known test links, codes and visit keys (only their hashes are stored, as the functions would), the locked guest tables, every guest and coach function with who may call it, Send to client, and `GUEST_SCENARIOS`: a guest reaches only their own rows and only with the right link, email and code; expired, switched-off and locked links refuse; earlier work only once the email is confirmed; each coach sees only their own links, guests and answers (the owner lists all, but reads only their own guests' answers); claiming moves every row once; deleting removes only what it should; codes and tokens are never returned except once to the coach who made the link. On a database without 035 every guest check is skipped.

## Migration 036: the Health Check's answers

`alignment.mjs` holds the Health Check part: three finished Health Checks made inside the rolled-back transaction (one made by the second coach, one by the owner, an older one with no coach recorded), the new functions with who may call them, and scenarios: only the link's coach reads its answers, the owner reads only their own links and older ones, someone signed out reads nothing, and nobody signed in learns who gets the emails. On a database without 036 they are skipped.
