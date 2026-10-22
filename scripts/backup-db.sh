#!/bin/bash
#
# Manual backup of The Clarity Portal database (Supabase).
#
# Backs up the public, auth and storage schemas to
# ~/Documents/clarity-backups/clarity-YYYY-MM-DD-HHMM.dump (London time),
# checks the file can be read, and keeps the newest 12 backups.
#
# Run it from a normal Terminal window:
#   bash scripts/backup-db.sh
#
# See scripts/README-backup.md for the full guide.
#
# SAFETY: the connection string is read from ~/.clarity-backup.env and must
# never be printed. Do not add "set -x", "echo $DB_URL" or similar to this file.

set +x
set -euo pipefail
umask 077

ENV_FILE="$HOME/.clarity-backup.env"
# How the file is named in messages to Tim (shown as text, not expanded).
# shellcheck disable=SC2088
ENV_SHOWN='~/.clarity-backup.env'
BACKUP_DIR="$HOME/Documents/clarity-backups"
KEEP=12
MIN_PG_VERSION=15

DB_URL=""
DB_PASS=""
PARTIAL_FILE=""
ERR_FILE=""
LIST_FILE=""

# shellcheck disable=SC2329  # called by the EXIT trap below
cleanup() {
  [ -n "$PARTIAL_FILE" ] && rm -f "$PARTIAL_FILE"
  [ -n "$ERR_FILE" ] && rm -f "$ERR_FILE"
  [ -n "$LIST_FILE" ] && rm -f "$LIST_FILE"
  return 0
}
trap cleanup EXIT

# Removes the connection string and password from any text before it is shown.
redact() {
  local text="$1"
  if [ -n "$DB_URL" ]; then
    text="${text//"$DB_URL"/[connection details hidden]}"
  fi
  if [ -n "$DB_PASS" ]; then
    text="${text//"$DB_PASS"/[hidden]}"
  fi
  printf '%s\n' "$text"
}

fail() {
  redact "Backup failed: $1"
  exit 1
}

human_size() {
  awk -v b="$1" 'BEGIN {
    if (b >= 1073741824) printf "%.1f GB", b / 1073741824
    else if (b >= 1048576) printf "%.1f MB", b / 1048576
    else if (b >= 1024) printf "%.1f KB", b / 1024
    else printf "%d bytes", b
  }'
}

# --- Find pg_dump and pg_restore (Homebrew libpq, not on PATH) ---

PG_BIN=""
for dir in /opt/homebrew/opt/libpq/bin /usr/local/opt/libpq/bin; do
  if [ -x "$dir/pg_dump" ] && [ -x "$dir/pg_restore" ]; then
    PG_BIN="$dir"
    break
  fi
done
[ -n "$PG_BIN" ] || fail "pg_dump is not installed. In Terminal run: brew install libpq"

pg_major=$("$PG_BIN/pg_dump" --version | awk '{ split($NF, v, "."); print v[1] }')
case "$pg_major" in
  ''|*[!0-9]*) fail "could not read the pg_dump version. In Terminal run: brew upgrade libpq" ;;
esac
[ "$pg_major" -ge "$MIN_PG_VERSION" ] ||
  fail "pg_dump is version $pg_major, but $MIN_PG_VERSION or newer is needed. In Terminal run: brew upgrade libpq"

# --- Read the connection string without printing it ---

[ -f "$ENV_FILE" ] ||
  fail "$ENV_SHOWN is missing. Create it as described in scripts/README-backup.md."

perms=$(stat -f '%Lp' "$ENV_FILE")
[ "$perms" = "600" ] ||
  fail "$ENV_SHOWN has permissions $perms, but must be 600. In Terminal run: chmod 600 $ENV_SHOWN"

while IFS= read -r line || [ -n "$line" ]; do
  line="${line%$'\r'}"
  line="${line#export }"
  case "$line" in
    DB_URL=*) DB_URL="${line#DB_URL=}" ;;
  esac
done < "$ENV_FILE"

# Strip one pair of surrounding quotes.
case "$DB_URL" in
  \"*\") DB_URL="${DB_URL#\"}"; DB_URL="${DB_URL%\"}" ;;
  \'*\') DB_URL="${DB_URL#\'}"; DB_URL="${DB_URL%\'}" ;;
esac

[ -n "$DB_URL" ] ||
  fail "$ENV_SHOWN has no DB_URL line. It should be one line: DB_URL=\"postgresql://...\""

case "$DB_URL" in
  postgres://*|postgresql://*) ;;
  *) fail "DB_URL in $ENV_SHOWN does not start with postgresql:// - copy it again from Supabase." ;;
esac

# Password, if any, from postgresql://user:password@host..., so it can be hidden too.
userinfo="${DB_URL#*://}"
if [ "$userinfo" != "${userinfo%%@*}" ]; then
  userinfo="${userinfo%%@*}"
  if [ "$userinfo" != "${userinfo#*:}" ]; then
    DB_PASS="${userinfo#*:}"
  fi
fi
unset userinfo

# --- Run the backup ---

mkdir -p "$BACKUP_DIR" || fail "could not create the folder $BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

stamp=$(TZ=Europe/London date +%Y-%m-%d-%H%M)
name="clarity-$stamp.dump"
final_file="$BACKUP_DIR/$name"
[ ! -e "$final_file" ] ||
  fail "$name already exists. Wait a minute and run the backup again."

PARTIAL_FILE="$BACKUP_DIR/$name.partial"
ERR_FILE=$(mktemp -t clarity-backup-err)
LIST_FILE=$(mktemp -t clarity-backup-list)

echo "Backing up The Clarity Portal database (public, auth and storage) ..."

if ! "$PG_BIN/pg_dump" \
    --dbname="$DB_URL" \
    --format=custom \
    --schema=public \
    --schema=auth \
    --schema=storage \
    --no-owner \
    --no-privileges \
    --file="$PARTIAL_FILE" 2> "$ERR_FILE"; then
  echo "pg_dump reported:"
  redact "$(cat "$ERR_FILE")"
  fail "pg_dump could not complete the backup (see the message above)."
fi

if [ -s "$ERR_FILE" ]; then
  echo "pg_dump warnings:"
  redact "$(cat "$ERR_FILE")"
fi

# --- Check the file without touching the live database ---

size=$(stat -f '%z' "$PARTIAL_FILE")
[ "$size" -gt 0 ] || fail "the backup file is empty."

if ! "$PG_BIN/pg_restore" --list "$PARTIAL_FILE" > "$LIST_FILE" 2> "$ERR_FILE"; then
  echo "pg_restore reported:"
  redact "$(cat "$ERR_FILE")"
  fail "the backup file could not be read back, so it may be damaged."
fi

table_count=$(awk '$4 == "TABLE" && $5 != "DATA"' "$LIST_FILE" | wc -l | tr -d ' ')
data_count=$(awk '$4 == "TABLE" && $5 == "DATA"' "$LIST_FILE" | wc -l | tr -d ' ')
[ "$table_count" -gt 0 ] || fail "the backup file contains no tables."

mv "$PARTIAL_FILE" "$final_file"
PARTIAL_FILE=""

echo "Checked: $(human_size "$size"), $table_count tables, $data_count table-data entries."

# --- Keep the newest $KEEP backups ---

removed=0
for f in "$BACKUP_DIR"/*.dump; do
  [ -f "$f" ] || continue
  printf '%s\t%s\n' "$(stat -f '%m' "$f")" "$f"
done | sort -rn | tail -n +"$((KEEP + 1))" | cut -f 2- > "$LIST_FILE"

while IFS= read -r old; do
  [ -n "$old" ] || continue
  rm -f "$old"
  echo "Removed old backup: $(basename "$old")"
  removed=$((removed + 1))
done < "$LIST_FILE"

if [ "$removed" -eq 0 ]; then
  echo "No old backups to remove (keeping the newest $KEEP)."
fi

echo "Backup saved: $name ($(human_size "$size"))"
exit 0
