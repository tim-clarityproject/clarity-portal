#!/bin/bash
#
# Adds invented test data to the TEST Supabase project (clarity-portal-test)
# for the four test accounts. Never connects to the live database.
#
# The data itself is in scripts/seed-test-data.sql. It runs as one
# transaction, so a failure leaves the test project as it was. Running it
# again replaces the invented data rather than doubling it.
#
# Run it from a normal Terminal window, after copy-structure-to-test.sh and
# after creating the four test accounts:
#   bash scripts/seed-test-data.sh
#
# See scripts/README-test-database.md for the full guide.
#
# SAFETY: the connection string must never be printed. Do not add "set -x",
# "echo $TEST_URL" or similar to this file.

set +x
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/test-db-common.sh
. "$SCRIPT_DIR/test-db-common.sh"
FAIL_PREFIX="Seed failed"
SEED_SQL="$SCRIPT_DIR/seed-test-data.sql"

[ "$#" -eq 0 ] || fail "this script takes no options."
[ -f "$SEED_SQL" ] || fail "scripts/seed-test-data.sql is missing."

ERR=""
# shellcheck disable=SC2329  # called by the EXIT trap below
cleanup() {
  [ -n "$ERR" ] && rm -f "$ERR"
  return 0
}
trap cleanup EXIT

# --- 1. Checks before any connection is made ---
# Only the test connection string is read. The live one is never opened.

find_pg_tools
load_test_url
ERR=$(mktemp -t clarity-seed-err)

echo "Checks passed: the connection is for clarity-portal-test."

# --- 2. Are the structure and the four accounts there? ---

if ! tables=$(psql_test "$ERR" <<'SQL'
select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind in ('r', 'p');
SQL
); then
  show_errors "$ERR"
  fail "could not connect to the test project (see the message above)."
fi
[ "$tables" -gt 0 ] ||
  fail "the test project has no tables yet. Run bash scripts/copy-structure-to-test.sh first."

if ! missing=$(psql_test "$ERR" <<'SQL'
select coalesce(string_agg(e, ', ' order by e), '')
  from unnest(array['coach-owner@example.com', 'coach-two@example.com',
                    'client@example.com', 'org-client@example.com']) as e
 where not exists (select 1 from auth.users u where lower(u.email) = e);
SQL
); then
  show_errors "$ERR"
  fail "could not look up the test accounts (see the message above)."
fi
[ -z "$missing" ] ||
  fail "these test accounts are missing: $missing. Create them in the test project (Authentication, Users, Add user) and run this again."

# --- 3. Add the invented data, all or nothing ---

echo "Adding invented test data ..."

if ! output=$(psql_test "$ERR" --single-transaction --file="$SEED_SQL"); then
  echo "The test project reported:"
  show_errors "$ERR"
  fail "nothing was added, and the test project is as it was (see the message above)."
fi

summary=$(printf '%s\n' "$output" | awk 'NF { last = $0 } END { print last }')
echo "Test data added: $summary"
exit 0
