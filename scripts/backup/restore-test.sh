#!/usr/bin/env bash
# Proves the latest backup actually restores: decrypts it, restores the
# public schema into a fresh scratch database on a LOCAL Postgres, prints
# row counts for the tables that matter, and drops the scratch database.
# Run monthly. Never point SCRATCH_ADMIN_URL at Supabase.
set -euo pipefail

ENV_FILE="${PORTPASS_BACKUP_ENV:-/etc/portpass-backup.env}"

fail() { echo "restore-test: $*" >&2; exit 1; }

[[ -f "$ENV_FILE" ]] || fail "missing $ENV_FILE"
mode="$(stat -c '%a' "$ENV_FILE")"
[[ "$mode" == "600" || "$mode" == "400" ]] || fail "$ENV_FILE must be mode 600 (is $mode)"

set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a

: "${BACKUP_DIR:?must be set in $ENV_FILE}"
: "${AGE_IDENTITY_FILE:?must be set in $ENV_FILE (path to the age private key)}"
: "${SCRATCH_ADMIN_URL:?must be set in $ENV_FILE (local Postgres URL with CREATE DATABASE rights)}"

[[ "$SCRATCH_ADMIN_URL" != *supabase* ]] || fail "SCRATCH_ADMIN_URL must be a local scratch server, not Supabase"
command -v pg_restore >/dev/null || fail "pg_restore not installed (postgresql-client-17)"
command -v psql >/dev/null || fail "psql not installed"
command -v age >/dev/null || fail "age not installed"

latest="$(ls -1t "$BACKUP_DIR"/nightly/portpass-*.dump.age 2>/dev/null | head -n 1 || true)"
[[ -n "$latest" ]] || fail "no backups found in $BACKUP_DIR/nightly"

scratch="portpass_restore_test_$(date -u +%Y%m%d%H%M%S)"
# Same server, different database name (keeps any ?options on the URL).
scratch_url="$(printf '%s' "$SCRATCH_ADMIN_URL" | sed -E "s#/[^/?]+(\?.*)?\$#/$scratch\1#")"
plain="$(mktemp)"

cleanup() {
  rm -f "$plain"
  psql "$SCRATCH_ADMIN_URL" -qc "drop database if exists \"$scratch\"" >/dev/null 2>&1 || true
}
trap cleanup EXIT

age -d -i "$AGE_IDENTITY_FILE" -o "$plain" "$latest"
psql "$SCRATCH_ADMIN_URL" -qc "create database \"$scratch\""

# public schema only: the auth/storage schemas need Supabase's own roles and
# extensions, which a plain Postgres doesn't have. Ownership/privilege
# statements are skipped for the same reason. Warnings about missing
# extensions are expected; the row counts are the verdict.
pg_restore --schema=public --no-owner --no-privileges --dbname="$scratch_url" "$plain" || true

echo "Row counts restored from $(basename "$latest"):"
for table in registrations payments organizations; do
  count="$(psql "$scratch_url" -tAc "select count(*) from public.$table" 2>/dev/null || echo "MISSING")"
  printf '  %-15s %s\n' "$table" "$count"
  [[ "$count" != "MISSING" ]] || fail "table public.$table did not restore"
done
echo "restore test ok"
