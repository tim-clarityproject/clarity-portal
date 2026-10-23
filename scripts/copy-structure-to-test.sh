#!/bin/bash
#
# Copies the STRUCTURE of the live database (never its data) into the test
# Supabase project, clarity-portal-test.
#
# What is copied:
#   - the public schema: tables, types, views, functions, triggers, indexes,
#     row level security and its policies, and the grants Supabase relies on
#   - triggers on the auth tables that call functions in public (for example
#     the one that creates a profile row when someone signs up)
#   - storage buckets (created empty) and their storage rules
#   - any extensions the structure needs that the test project lacks
# What is never copied: any rows of data, Supabase's own auth and storage
# tables (already in the test project), Edge Functions and scheduled jobs.
#
# The live database is only read: by pg_dump, and by a few questions about
# the structure, each run inside a read-only transaction that is rolled back.
#
# Run it from a normal Terminal window:
#   bash scripts/copy-structure-to-test.sh
# If the test project already has tables, it stops. To empty the test
# project's public schema and copy again:
#   bash scripts/copy-structure-to-test.sh --start-over
#
# See scripts/README-test-database.md for the full guide.
#
# SAFETY: the connection strings must never be printed. Do not add "set -x",
# "echo $LIVE_URL", "echo $TEST_URL" or similar to this file.

set +x
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/test-db-common.sh
. "$SCRIPT_DIR/test-db-common.sh"
FAIL_PREFIX="Copy failed"

START_OVER=0
case "${1:-}" in
  '') ;;
  --start-over) START_OVER=1 ;;
  *) fail "unknown option '$1'. The only option is --start-over." ;;
esac
[ "$#" -le 1 ] || fail "too many options. The only option is --start-over."

WORK_DIR=""
# shellcheck disable=SC2329  # called by the EXIT trap below
cleanup() {
  [ -n "$WORK_DIR" ] && rm -rf "$WORK_DIR"
  return 0
}
trap cleanup EXIT

# --- 1. Checks before any connection is made ---

find_pg_tools
load_test_url
load_live_url

WORK_DIR=$(mktemp -d -t clarity-copy)
ERR="$WORK_DIR/errors.txt"
DUMP="$WORK_DIR/live-structure.dump"
LIST="$WORK_DIR/list.txt"
PUBLIC_SQL="$WORK_DIR/public.sql"
EXT_SQL="$WORK_DIR/extensions.sql"
AUTH_SQL="$WORK_DIR/auth-triggers.sql"
STORAGE_SQL="$WORK_DIR/storage.sql"
ALL_SQL="$WORK_DIR/copy.sql"

echo "Checks passed: the test connection is for clarity-portal-test and live is a different project."

# --- 2. Is the test project empty? ---

if ! test_tables=$(psql_test "$ERR" <<'SQL'
select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind in ('r', 'p');
SQL
); then
  show_errors "$ERR"
  fail "could not connect to the test project (see the message above)."
fi

if [ "$test_tables" -gt 0 ] && [ "$START_OVER" -eq 0 ]; then
  fail "the test project already has $test_tables tables, so nothing was changed. To empty it and copy again, run: bash scripts/copy-structure-to-test.sh --start-over"
fi

# --- 3. Read the live structure (read only) ---

echo "Reading the live structure (read only) ..."

if ! live_counts=$(psql_live_read "$ERR" <<< "$STRUCTURE_COUNTS_SQL"); then
  show_errors "$ERR"
  fail "could not read the live database (see the message above)."
fi

# Every statement this script writes itself (rather than pg_dump) is read
# from live with search_path empty, so Postgres writes every function, table
# and type name in full (for example public.create_profile_on_signup()).
# Each statement also starts with a "-- Name: ...; Type: ..." line, like
# pg_dump's own, so a failure can name the object it stopped at.

# Extensions (such as pgcrypto and pg_cron), each in the schema live uses.
# Created on test only if missing, before the public schema that needs them.
# If test has one in a different schema from live, the copy stops: functions
# copied from live would not find it.
if ! psql_live_read "$ERR" > "$EXT_SQL" <<'SQL'
set local search_path = '';
select format(
  $f$-- Name: %s; Type: EXTENSION; Schema: %s
do $ext$
begin
  if not exists (select 1 from pg_catalog.pg_extension where extname = %L) then
    create schema if not exists %I;
    create extension %I with schema %I cascade;
  elsif (select n.nspname from pg_catalog.pg_extension e
           join pg_catalog.pg_namespace n on n.oid = e.extnamespace
          where e.extname = %L) <> %L then
    raise exception 'The extension %% is in a different schema in the test project from live (%%), so the copy was stopped.', %L, %L;
  end if;
end
$ext$;$f$,
  e.extname, n.nspname,
  e.extname,
  n.nspname, e.extname, n.nspname,
  e.extname, n.nspname,
  e.extname, n.nspname)
from pg_extension e join pg_namespace n on n.oid = e.extnamespace
where e.extname <> 'plpgsql'
order by e.extname;
SQL
then
  show_errors "$ERR"
  fail "could not read the live extensions (see the message above)."
fi

# Triggers on auth tables (such as auth.users) that call functions in public.
# Each is created only after its function is confirmed to be in the test
# project; if it is not, the copy stops and names it.
if ! psql_live_read "$ERR" > "$AUTH_SQL" <<'SQL'
set local search_path = '';
select format(
  $f$-- Name: %s; Type: TRIGGER; Schema: %s; Table: %s; Function: %s
do $chk$
begin
  if pg_catalog.to_regprocedure(%L) is null then
    raise exception 'The sign-up trigger %% needs the function %%, which is not in the test project, so the copy was stopped.', %L, %L;
  end if;
end
$chk$;
drop trigger if exists %I on %I.%I;
%s;$f$,
  t.tgname, n.nspname, c.relname, p.oid::regprocedure::text,
  p.oid::regprocedure::text,
  t.tgname, p.oid::regprocedure::text,
  t.tgname, n.nspname, c.relname,
  pg_get_triggerdef(t.oid))
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_proc p on p.oid = t.tgfoid
join pg_namespace pn on pn.oid = p.pronamespace
where n.nspname = 'auth' and not t.tgisinternal and pn.nspname = 'public'
order by 1;
SQL
then
  show_errors "$ERR"
  fail "could not read the live sign-up triggers (see the message above)."
fi

# Any other custom auth triggers are reported, not copied.
if ! other_auth=$(psql_live_read "$ERR" <<'SQL'
select count(*) from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_proc p on p.oid = t.tgfoid
join pg_namespace pn on pn.oid = p.pronamespace
where n.nspname = 'auth' and not t.tgisinternal and pn.nspname <> 'public';
SQL
); then
  show_errors "$ERR"
  fail "could not read the live auth triggers (see the message above)."
fi

# Storage buckets (empty: no files are copied) and storage rules.
if ! psql_live_read "$ERR" > "$STORAGE_SQL" <<'SQL'
set local search_path = '';
select format(
  E'-- Name: %s; Type: BUCKET; Schema: storage\n' ||
  'insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values (%L, %L, %L, %L, %L) on conflict (id) do update set name = excluded.name, public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;',
  id, id, name, public, file_size_limit, allowed_mime_types)
from storage.buckets
order by id;
select format(
  E'-- Name: %s; Type: POLICY; Schema: %s; Table: %s\n' ||
  'drop policy if exists %I on %I.%I; create policy %I on %I.%I as %s for %s to %s%s%s;',
  policyname, schemaname, tablename,
  policyname, schemaname, tablename,
  policyname, schemaname, tablename,
  permissive, cmd,
  (select string_agg(quote_ident(r), ', ') from unnest(roles) as r),
  case when qual is not null then ' using (' || qual || ')' else '' end,
  case when with_check is not null then ' with check (' || with_check || ')' else '' end)
from pg_policies
where schemaname = 'storage'
order by tablename, policyname;
SQL
then
  show_errors "$ERR"
  fail "could not read the live storage buckets and rules (see the message above)."
fi

# The public schema, structure only (pg_dump reads in a read-only transaction).
if ! "$PG_BIN/pg_dump" \
    --dbname="$LIVE_URL" \
    --format=custom \
    --schema-only \
    --schema=public \
    --no-publications \
    --no-subscriptions \
    --no-security-labels \
    --no-tablespaces \
    --file="$DUMP" 2> "$ERR"; then
  echo "pg_dump reported:"
  show_errors "$ERR"
  fail "pg_dump could not read the live structure (see the message above)."
fi
if [ -s "$ERR" ]; then
  echo "pg_dump warnings:"
  show_errors "$ERR"
fi

echo "Live structure read. Nothing on live was changed."

# --- 4. Build the copy, without connecting to anything ---

if ! "$PG_BIN/pg_restore" --list "$DUMP" > "$LIST" 2> "$ERR"; then
  show_errors "$ERR"
  fail "could not read the structure file pg_dump made."
fi

# Leave out what the test project already has from Supabase: the public
# schema itself, its comment and grants, the default grants for new objects,
# and extensions (handled above, only where missing).
grep -v -E \
  -e '^[0-9]+; [0-9]+ [0-9]+ SCHEMA - public ' \
  -e ' COMMENT - SCHEMA public ' \
  -e ' ACL - SCHEMA public ' \
  -e ' DEFAULT ACL ' \
  -e ' EXTENSION - ' \
  -e ' COMMENT - EXTENSION ' \
  "$LIST" > "$LIST.kept" || true
mv "$LIST.kept" "$LIST"

if ! "$PG_BIN/pg_restore" --use-list="$LIST" --no-owner --file="$PUBLIC_SQL" "$DUMP" 2> "$ERR"; then
  show_errors "$ERR"
  fail "could not turn the structure file into SQL."
fi

{
  # Nothing below relies on search_path: every name is written in full.
  # It is set empty here, as pg_dump's own part also does, so a name that
  # was not written in full fails at once instead of finding the wrong thing.
  printf '%s\n' "set search_path = '';"
  if [ "$START_OVER" -eq 1 ]; then
    # Empties the TEST project's public schema (the schema itself, and
    # Supabase's grants on it, stay). Objects that belong to extensions are
    # left alone. Dropping the functions also drops the sign-up triggers on
    # auth.users that call them.
    cat <<'SQL'
-- Name: the test project's public schema; Type: START OVER; Schema: public
do $start_over$
declare
  r record;
begin
  for r in
    select c.relname, c.relkind from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('v', 'm')
       and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass
                        and d.objid = c.oid and d.deptype = 'e')
  loop
    if r.relkind = 'm' then
      execute format('drop materialized view if exists public.%I cascade', r.relname);
    else
      execute format('drop view if exists public.%I cascade', r.relname);
    end if;
  end loop;

  for r in
    select c.relname, c.relkind from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p', 'f', 'S')
       and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass
                        and d.objid = c.oid and d.deptype = 'e')
  loop
    if r.relkind = 'S' then
      execute format('drop sequence if exists public.%I cascade', r.relname);
    elsif r.relkind = 'f' then
      execute format('drop foreign table if exists public.%I cascade', r.relname);
    else
      execute format('drop table if exists public.%I cascade', r.relname);
    end if;
  end loop;

  for r in
    select p.proname, p.prokind, pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass
                        and d.objid = p.oid and d.deptype = 'e')
  loop
    if r.prokind = 'a' then
      execute format('drop aggregate if exists public.%I(%s) cascade', r.proname, r.args);
    else
      execute format('drop routine if exists public.%I(%s) cascade', r.proname, r.args);
    end if;
  end loop;

  for r in
    select t.typname from pg_type t join pg_namespace n on n.oid = t.typnamespace
     where n.nspname = 'public'
       and (t.typtype in ('e', 'd', 'r')
            or (t.typtype = 'c' and exists (select 1 from pg_class c
                                             where c.oid = t.typrelid and c.relkind = 'c')))
       and not exists (select 1 from pg_depend d where d.classid = 'pg_type'::regclass
                        and d.objid = t.oid and d.deptype = 'e')
  loop
    execute format('drop type if exists public.%I cascade', r.typname);
  end loop;
end
$start_over$;
SQL
  fi
  cat "$EXT_SQL"
  # pg_restore 17 and newer add "SET transaction_timeout", which older
  # servers do not understand. It is not needed here.
  sed '/^SET transaction_timeout = /d' "$PUBLIC_SQL"
  printf '\n'
  # The auth triggers come after pg_dump's part, so every public function
  # they call already exists.
  printf '%s\n' "set search_path = '';"
  cat "$AUTH_SQL"
  cat "$STORAGE_SQL"
} > "$ALL_SQL"

# --- 5. Apply the copy to the TEST project, all or nothing ---

if [ "$START_OVER" -eq 1 ]; then
  echo "Emptying the test project's public schema and copying the structure ..."
else
  echo "Copying the structure into the test project ..."
fi

if ! psql_test "$ERR" --single-transaction --file="$ALL_SQL" > /dev/null; then
  echo "The test project reported:"
  show_errors "$ERR"
  # Name the object it stopped at, from the "-- Name:" line before the
  # failing line of copy.sql.
  failed_line=$(sed -n -E 's/.*copy\.sql:([0-9]+): (ERROR|FATAL).*/\1/p' "$ERR" | head -n 1 || true)
  if [ -n "$failed_line" ]; then
    failed_object=$(head -n "$failed_line" "$ALL_SQL" | grep -E '^-- Name: ' | tail -n 1 | sed 's/^-- Name: //' || true)
    if [ -n "$failed_object" ]; then
      redact "It stopped while creating: $failed_object"
    fi
  fi
  fail "the copy was stopped and undone, so the test project is as it was (see the message above)."
fi

# --- 6. Compare the two projects ---

if ! test_counts=$(psql_test "$ERR" <<< "$STRUCTURE_COUNTS_SQL"); then
  show_errors "$ERR"
  fail "the copy finished, but the test project could not be checked afterwards."
fi

IFS='|' read -r l_tables l_policies l_functions l_triggers l_buckets <<< "$live_counts"
IFS='|' read -r t_tables t_policies t_functions t_triggers t_buckets <<< "$test_counts"

all_match=1
row() {
  local label="$1" live="$2" test="$3" mark="✓"
  if [ "$live" != "$test" ]; then
    mark="✗"
    all_match=0
  fi
  printf '%-12s %6s %6s   %s\n' "$label" "$live" "$test" "$mark"
}

echo
printf '%-12s %6s %6s   %s\n' "" "Live" "Test" "Match"
row "Tables" "$l_tables" "$t_tables"
row "Policies" "$l_policies" "$t_policies"
row "Functions" "$l_functions" "$t_functions"
row "Triggers" "$l_triggers" "$t_triggers"
row "Buckets" "$l_buckets" "$t_buckets"
echo

if [ "$other_auth" -gt 0 ]; then
  echo "Note: live has $other_auth other custom trigger(s) on the auth tables that call functions outside public. These were not copied."
fi

[ "$all_match" -eq 1 ] ||
  fail "the copy ran, but the counts above do not all match."

echo "Structure copied"
exit 0
