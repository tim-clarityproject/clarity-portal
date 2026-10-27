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

Migrations 024 onwards run first in the same rolled-back transaction, so the rules are checked as they will be once Tim has run them. `--as-is` checks the test database exactly as it is.

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
