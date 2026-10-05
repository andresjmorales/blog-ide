#!/bin/sh
# Runtime Supabase config for the BlogIDE image.
#
# Next.js inlines NEXT_PUBLIC_* into the build output, so a prebuilt image
# (for example from GHCR) would carry whatever Supabase project it was built
# against. The Dockerfile builds with the sentinels below instead, and this
# script swaps in the real values from the container environment before the
# server starts. Container env is fixed at creation, so this runs once per
# container against the image's pristine files; a new value means a new
# container (`docker compose up -d` recreates it).
#
# An image built with real values passed as build args has no sentinels, and
# this script leaves it alone.
set -eu

URL_SENTINEL="https://blogide-runtime-supabase-url.invalid"
KEY_SENTINEL="blogide-runtime-supabase-anon-key"

files="$(grep -rlF -e "$URL_SENTINEL" -e "$KEY_SENTINEL" .next 2>/dev/null || true)"

if [ -n "$files" ]; then
  if [ -z "${NEXT_PUBLIC_SUPABASE_URL:-}" ] || [ -z "${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}" ]; then
    echo "blogide: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see .env.example)" >&2
    exit 1
  fi
  # Escape the characters sed treats specially in a replacement (\ & and the | delimiter).
  esc() { printf '%s' "$1" | sed -e 's/[\\&|]/\\&/g'; }
  url="$(esc "${NEXT_PUBLIC_SUPABASE_URL%/}")"
  key="$(esc "$NEXT_PUBLIC_SUPABASE_ANON_KEY")"
  printf '%s\n' "$files" | while IFS= read -r f; do
    sed -i -e "s|$URL_SENTINEL|$url|g" -e "s|$KEY_SENTINEL|$key|g" "$f"
  done
fi

exec "$@"
