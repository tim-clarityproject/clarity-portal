#!/bin/bash
#
# Dry-runs SQL files on the TEST project (clarity-portal-test) only, inside
# one transaction that is always rolled back, so nothing is ever kept.
#
#   bash scripts/dry-run-on-test.sh FILE.sql [FILE.sql ...]
#
# The files run in the order given, in the same transaction, so a migration
# and its test can run together:
#
#   bash scripts/dry-run-on-test.sh supabase/migrations/024_baseline_live_structure.sql supabase/024_baseline_test.sql
#
# Safety:
#   - It reads only ~/.clarity-test.env and stops unless that is the test
#     project (the same checks as the copy and seed scripts). It never reads
#     the live connection string.
#   - It refuses any file holding commit, rollback, end, begin, a psql
#     command or anything else that could end the transaction early
#     (scripts/check-dry-run-sql.mjs). Such files are run by Tim in the SQL
#     editor instead.
#   - It stops at the first error. The connection then closes, which undoes
#     everything.
#   - The connection string and password are never printed.
#
# Output: whatever the SQL shows (query results and notices), then the line
# "Dry run finished and rolled back: nothing was kept." Exit status 1 if the
# SQL stopped with an error.

set +x
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=test-db-common.sh
. "$SCRIPT_DIR/test-db-common.sh"
FAIL_PREFIX="Dry run failed"

[ "$#" -ge 1 ] || fail "name at least one SQL file."
for file in "$@"; do
  [ -f "$file" ] || fail "$file is not a file."
done

node "$SCRIPT_DIR/check-dry-run-sql.mjs" "$@" || fail "nothing was run (see above)."

find_pg_tools
load_test_url

OUT=$(mktemp -t clarity-dry-run)
trap 'rm -f "$OUT"' EXIT

status=0
{
  printf '%s\n' 'begin;'
  # The project's usual 8 second limit is for the app; a dry run may take longer.
  printf '%s\n' "set local statement_timeout = '120s';"
  for file in "$@"; do
    cat "$file"
    printf '\n'
  done
  printf '%s\n' 'rollback;'
} | "$PG_BIN/psql" --dbname="$TEST_URL" --no-psqlrc --quiet --no-align --tuples-only \
      --set=ON_ERROR_STOP=1 > "$OUT" 2>&1 || status=$?

redact "$(cat "$OUT")"
if [ "$status" -ne 0 ]; then
  fail "the SQL stopped with an error (shown above). Nothing was kept."
fi
echo "Dry run finished and rolled back: nothing was kept."
