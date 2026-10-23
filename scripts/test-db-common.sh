#!/bin/bash
#
# Shared helpers for copy-structure-to-test.sh and seed-test-data.sh.
# Sourced by those scripts, never run on its own.
#
# SAFETY: the connection strings read here must never be printed. Do not add
# "set -x", "echo $LIVE_URL", "echo $TEST_URL" or similar to this file.

set +x

# The test project (clarity-portal-test). Every script that writes anything
# checks the test connection string names this project before connecting.
TEST_PROJECT_REF="gqtqljngeenqzxneucoc"
MIN_PG_VERSION=15

LIVE_ENV_FILE="$HOME/.clarity-backup.env"
TEST_ENV_FILE="$HOME/.clarity-test.env"
# How the files are named in messages to Tim (shown as text, not expanded).
# shellcheck disable=SC2088
LIVE_ENV_SHOWN='~/.clarity-backup.env'
# shellcheck disable=SC2088
TEST_ENV_SHOWN='~/.clarity-test.env'

LIVE_URL=""
LIVE_PASS=""
TEST_URL=""
TEST_PASS=""
PG_BIN=""

# The word used by fail() at the start of its one-line message, for example
# "Copy failed" or "Seed failed". Each script sets this before calling fail.
FAIL_PREFIX="Failed"

# Removes both connection strings and both passwords from any text before it
# is shown.
redact() {
  local text="$1"
  local secret
  for secret in "$LIVE_URL" "$TEST_URL" "$LIVE_PASS" "$TEST_PASS"; do
    if [ -n "$secret" ]; then
      text="${text//"$secret"/[hidden]}"
    fi
  done
  printf '%s\n' "$text"
}

fail() {
  redact "$FAIL_PREFIX: $1"
  exit 1
}

# Shows the contents of an error file, with secrets removed.
show_errors() {
  local file="$1"
  [ -s "$file" ] || return 0
  redact "$(cat "$file")"
}

# --- Find psql, pg_dump and pg_restore (Homebrew libpq, not on PATH) ---

find_pg_tools() {
  local dir
  for dir in /opt/homebrew/opt/libpq/bin /usr/local/opt/libpq/bin; do
    if [ -x "$dir/pg_dump" ] && [ -x "$dir/pg_restore" ] && [ -x "$dir/psql" ]; then
      PG_BIN="$dir"
      break
    fi
  done
  [ -n "$PG_BIN" ] || fail "psql and pg_dump are not installed. In Terminal run: brew install libpq"

  local tool major
  for tool in pg_dump pg_restore psql; do
    major=$("$PG_BIN/$tool" --version | awk '{ split($NF, v, "."); print v[1] }')
    case "$major" in
      ''|*[!0-9]*) fail "could not read the $tool version. In Terminal run: brew upgrade libpq" ;;
    esac
    [ "$major" -ge "$MIN_PG_VERSION" ] ||
      fail "$tool is version $major, but $MIN_PG_VERSION or newer is needed. In Terminal run: brew upgrade libpq"
  done
}

# --- Read a connection string without printing it ---
#
# read_db_url FILE SHOWN_NAME
# Sets READ_URL and READ_PASS. Accepts DB_URL="...", DB_URL='...' and
# DB_URL=... (no quotes), with or without "export " in front.
READ_URL=""
READ_PASS=""
read_db_url() {
  local file="$1" shown="$2" line perms userinfo
  READ_URL=""
  READ_PASS=""

  [ -f "$file" ] || fail "$shown is missing."

  perms=$(stat -f '%Lp' "$file")
  [ "$perms" = "600" ] ||
    fail "$shown has permissions $perms, but must be 600. In Terminal run: chmod 600 $shown"

  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    line="${line#export }"
    case "$line" in
      DB_URL=*) READ_URL="${line#DB_URL=}" ;;
    esac
  done < "$file"

  # Strip one pair of surrounding quotes.
  case "$READ_URL" in
    \"*\") READ_URL="${READ_URL#\"}"; READ_URL="${READ_URL%\"}" ;;
    \'*\') READ_URL="${READ_URL#\'}"; READ_URL="${READ_URL%\'}" ;;
  esac

  [ -n "$READ_URL" ] || fail "$shown has no DB_URL line."

  case "$READ_URL" in
    postgres://*|postgresql://*) ;;
    *) fail "DB_URL in $shown does not start with postgresql:// - copy it again from Supabase." ;;
  esac

  # Password, if any, from postgresql://user:password@host..., so it can be
  # hidden too.
  userinfo="${READ_URL#*://}"
  if [ "$userinfo" != "${userinfo%%@*}" ]; then
    userinfo="${userinfo%%@*}"
    if [ "$userinfo" != "${userinfo#*:}" ]; then
      READ_PASS="${userinfo#*:}"
    fi
  fi
}

# The connection string with the password taken out, used only for the
# project checks below (so a password that happens to contain the project
# reference cannot pass the check).
url_without_password() {
  local url="$1" pass="$2"
  if [ -n "$pass" ]; then
    printf '%s' "${url//"$pass"/}"
  else
    printf '%s' "$url"
  fi
}

# --- The project checks, run before any connection is made ---

# Reads the test connection string and stops unless it names the test project.
load_test_url() {
  read_db_url "$TEST_ENV_FILE" "$TEST_ENV_SHOWN"
  TEST_URL="$READ_URL"
  TEST_PASS="$READ_PASS"
  READ_URL=""
  READ_PASS=""

  case "$(url_without_password "$TEST_URL" "$TEST_PASS")" in
    *"$TEST_PROJECT_REF"*) ;;
    *) fail "the connection string in $TEST_ENV_SHOWN is not for the test project (clarity-portal-test), so nothing was done." ;;
  esac
}

# Reads the live connection string and stops unless it is a different project
# from the test one. Call after load_test_url.
load_live_url() {
  read_db_url "$LIVE_ENV_FILE" "$LIVE_ENV_SHOWN"
  LIVE_URL="$READ_URL"
  LIVE_PASS="$READ_PASS"
  READ_URL=""
  READ_PASS=""

  case "$LIVE_URL" in
    *"$TEST_PROJECT_REF"*)
      fail "the connection string in $LIVE_ENV_SHOWN points at the test project, not live, so nothing was done." ;;
  esac
  [ "$LIVE_URL" != "$TEST_URL" ] ||
    fail "$LIVE_ENV_SHOWN and $TEST_ENV_SHOWN hold the same connection string, so nothing was done."
}

# --- Running SQL ---
#
# psql_test ERR_FILE [psql options...]   SQL comes from standard input.
# psql_live_read ERR_FILE                SQL comes from standard input, and is
#                                        always wrapped in a read-only
#                                        transaction that is rolled back.
# Both print query results unaligned, with | between columns, and stop at the
# first error. Errors go to ERR_FILE, never to the screen directly.

psql_test() {
  local err_file="$1"
  shift
  "$PG_BIN/psql" --dbname="$TEST_URL" --no-psqlrc --quiet --no-align --tuples-only \
    --field-separator='|' --set=ON_ERROR_STOP=1 "$@" 2> "$err_file"
}

psql_live_read() {
  local err_file="$1"
  {
    printf '%s\n' 'set session characteristics as transaction read only;'
    printf '%s\n' 'set default_transaction_read_only = on;'
    printf '%s\n' 'begin transaction isolation level repeatable read read only;'
    cat
    printf '\n%s\n' 'rollback;'
  } | "$PG_BIN/psql" --dbname="$LIVE_URL" --no-psqlrc --quiet --no-align --tuples-only \
    --field-separator='|' --set=ON_ERROR_STOP=1 2> "$err_file"
}

# Counts used by the copy script's comparison table and by the seed script's
# check that the structure is in place. Run on either project; reads only.
# Output: one line, tables|policies|functions|triggers|buckets
# shellcheck disable=SC2034  # used by the scripts that source this file
STRUCTURE_COUNTS_SQL="
select
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p'))
  || '|' ||
  (select count(*) from pg_policies where schemaname in ('public', 'storage'))
  || '|' ||
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not exists (select 1 from pg_depend d
                       where d.classid = 'pg_proc'::regclass and d.objid = p.oid
                         and d.deptype = 'e'))
  || '|' ||
  (select count(*) from pg_trigger t
     join pg_class c on c.oid = t.tgrelid
     join pg_namespace n on n.oid = c.relnamespace
     join pg_proc p on p.oid = t.tgfoid
     join pg_namespace pn on pn.oid = p.pronamespace
    where not t.tgisinternal
      and (n.nspname = 'public' or (n.nspname = 'auth' and pn.nspname = 'public')))
  || '|' ||
  (select count(*) from storage.buckets);
"
