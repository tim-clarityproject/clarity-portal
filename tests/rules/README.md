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
