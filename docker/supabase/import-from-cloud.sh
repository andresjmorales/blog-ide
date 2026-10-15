#!/usr/bin/env bash
#
# Copy a Supabase Cloud project's BlogIDE data into this self-hosted stack:
# accounts (auth.users and identities), every public table, and the files in
# Storage. Run it once, on a fresh stack, with the app stopped:
#
#   docker compose stop blogide
#   docker compose --profile import run --rm import
#   docker compose up -d
#
# Needs, in .env (see .env.example, "Moving from Supabase Cloud"):
#   SOURCE_DB_URL               the Cloud project's Session pooler URI
#   SOURCE_SUPABASE_URL         https://<ref>.supabase.co
#   SOURCE_SERVICE_ROLE_KEY     the Cloud project's secret / service_role key
#
# What it does not copy: sessions and refresh tokens (everyone signs in once
# more on the new address) and the audit log. Nothing in the Cloud project
# is changed.
set -euo pipefail

: "${SOURCE_DB_URL:?set SOURCE_DB_URL in .env (Session pooler URI)}"
: "${SOURCE_SUPABASE_URL:?set SOURCE_SUPABASE_URL in .env}"
: "${SOURCE_SERVICE_ROLE_KEY:?set SOURCE_SERVICE_ROLE_KEY in .env}"
: "${POSTGRES_PASSWORD:?}"
: "${SERVICE_ROLE_KEY:?}"

SOURCE_SUPABASE_URL="${SOURCE_SUPABASE_URL%/}"
TARGET_STORAGE="${TARGET_STORAGE:-http://storage:5000}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# supabase_admin is the superuser: needed so the restore can run with
# triggers off (session_replication_role) and write the auth schema.
target() {
  PGPASSWORD="$POSTGRES_PASSWORD" psql -v ON_ERROR_STOP=1 --no-psqlrc -q \
    -h "${DB_HOST:-db}" -U supabase_admin -d postgres "$@"
}
source_db() { psql -v ON_ERROR_STOP=1 --no-psqlrc -q "$SOURCE_DB_URL" "$@"; }

echo "==> checking the target is empty"
existing="$(target -tAc 'select count(*) from auth.users')"
if [ "$existing" != "0" ] && [ "${IMPORT_FORCE:-}" != "1" ]; then
  echo "import: this stack already has $existing account(s). Import into a fresh" >&2
  echo "        stack (docker compose down -v, then up), or set IMPORT_FORCE=1." >&2
  exit 1
fi

echo "==> checking the source is reachable"
source_db -tAc 'select 1' >/dev/null

echo "==> dumping accounts and app data"
# Data only: the schema comes from supabase/migrations, applied by `migrate`.
# Auth and Storage tables that their services own, and per-login state, stay
# behind.
pg_dump "$SOURCE_DB_URL" --data-only --no-owner --no-privileges \
  --schema=public --schema=auth \
  --exclude-table-data='auth.schema_migrations' \
  --exclude-table-data='auth.sessions' \
  --exclude-table-data='auth.refresh_tokens' \
  --exclude-table-data='auth.mfa_amr_claims' \
  --exclude-table-data='auth.mfa_challenges' \
  --exclude-table-data='auth.flow_state' \
  --exclude-table-data='auth.one_time_tokens' \
  --exclude-table-data='auth.audit_log_entries' \
  --exclude-table-data='auth.saml_relay_states' \
  > "$WORK/data.sql"
echo "    $(wc -c < "$WORK/data.sql") bytes"

echo "==> restoring (one transaction, triggers off)"
# Triggers off so quota counters, welcome documents and the like do not run
# a second time on rows that already carry their results.
{
  echo "set session_replication_role = replica;"
  cat "$WORK/data.sql"
} | target -1 -f - > /dev/null

echo "==> copying Storage files"
# Paths are kept, so every link in an essay still names the right object.
urlpath() {
  # Percent-encode each path segment, keeping the slashes.
  local s="$1" out="" c i
  for ((i = 0; i < ${#s}; i++)); do
    c="${s:i:1}"
    case "$c" in
      [a-zA-Z0-9._~/-]) out+="$c" ;;
      *) out+="$(printf '%%%02X' "'$c")" ;;
    esac
  done
  printf '%s' "$out"
}

source_db -tA -F $'\t' -c "
  select bucket_id, name,
         coalesce(metadata->>'mimetype', 'application/octet-stream'),
         coalesce(owner_id, '')
  from storage.objects
  where name not like '%.emptyFolderPlaceholder'
  order by bucket_id, name" > "$WORK/objects.tsv"

total="$(wc -l < "$WORK/objects.tsv" | tr -d ' ')"
copied=0
while IFS=$'\t' read -r bucket name mime owner; do
  [ -n "$bucket" ] || continue
  path="$(urlpath "$name")"
  curl -fsS -o "$WORK/blob" \
    -H "Authorization: Bearer $SOURCE_SERVICE_ROLE_KEY" \
    -H "apikey: $SOURCE_SERVICE_ROLE_KEY" \
    "$SOURCE_SUPABASE_URL/storage/v1/object/$bucket/$path"
  curl -fsS -o /dev/null -X POST \
    -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
    -H "Content-Type: $mime" \
    -H "x-upsert: true" \
    --data-binary @"$WORK/blob" \
    "$TARGET_STORAGE/object/$bucket/$path"
  if [ -n "$owner" ]; then
    # Uploaded with the service key, so record the original owner.
    target -o /dev/null -c "update storage.objects set owner_id = '$owner',
                 owner = case when '$owner' ~ '^[0-9a-f-]{36}$' then '$owner'::uuid end
               where bucket_id = '$bucket' and name = \$\$${name}\$\$"
  fi
  copied=$((copied + 1))
  echo "    $copied/$total $bucket/$name"
done < "$WORK/objects.tsv"

echo "==> done: $(target -tAc 'select count(*) from auth.users') account(s), $copied file(s)"
echo "    Start the app (docker compose up -d) and sign in with your usual password."
