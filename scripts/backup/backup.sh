#!/usr/bin/env bash
# Nightly encrypted backup of the PortPass Supabase database (custom-format
# pg_dump, encrypted with age to a public key). Keeps 30 nightly copies and
# 12 monthly copies. Reads everything it needs from an env file that must be
# mode 600 -- nothing secret is ever passed on the command line or printed.
set -euo pipefail

ENV_FILE="${PORTPASS_BACKUP_ENV:-/etc/portpass-backup.env}"

fail() { echo "backup: $*" >&2; exit 1; }

[[ -f "$ENV_FILE" ]] || fail "missing $ENV_FILE (copy portpass-backup.env.example there and chmod 600)"
mode="$(stat -c '%a' "$ENV_FILE")"
[[ "$mode" == "600" || "$mode" == "400" ]] || fail "$ENV_FILE must be mode 600 (is $mode)"

set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a

: "${PORTPASS_DB_URL:?must be set in $ENV_FILE}"
: "${AGE_RECIPIENT:?must be set in $ENV_FILE}"
: "${BACKUP_DIR:?must be set in $ENV_FILE}"

command -v pg_dump >/dev/null || fail "pg_dump not installed (postgresql-client-17)"
command -v age >/dev/null || fail "age not installed"

NIGHTLY="$BACKUP_DIR/nightly"
MONTHLY="$BACKUP_DIR/monthly"
mkdir -p "$NIGHTLY" "$MONTHLY"
chmod 700 "$BACKUP_DIR" "$NIGHTLY" "$MONTHLY"

stamp="$(date -u +%Y%m%d-%H%M)"
out="$NIGHTLY/portpass-$stamp.dump.age"
tmp="$out.part"
trap 'rm -f "$tmp"' EXIT

# --no-owner/--no-privileges: Supabase's roles don't exist wherever this is
# restored. The dump itself is the whole database (public, auth, storage
# schemas), encrypted before it ever touches disk.
pg_dump --format=custom --no-owner --no-privileges --dbname="$PORTPASS_DB_URL" \
  | age -r "$AGE_RECIPIENT" -o "$tmp"
mv "$tmp" "$out"
chmod 600 "$out"
trap - EXIT

# The first backup of each month is also kept as that month's copy.
month="$(date -u +%Y%m)"
if ! compgen -G "$MONTHLY/portpass-$month*.dump.age" >/dev/null; then
  cp "$out" "$MONTHLY/portpass-$stamp.dump.age"
fi

# Retention: newest 30 nightly, newest 12 monthly.
ls -1t "$NIGHTLY"/portpass-*.dump.age 2>/dev/null | tail -n +31 | xargs -r rm -f
ls -1t "$MONTHLY"/portpass-*.dump.age 2>/dev/null | tail -n +13 | xargs -r rm -f

echo "backup ok: $out ($(du -h "$out" | cut -f1))"
