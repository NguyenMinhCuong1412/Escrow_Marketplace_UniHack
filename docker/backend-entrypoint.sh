#!/bin/sh
set -eu

SECRETS_FILE="/run/secrets-env/secrets.env"
if [ -z "${ATTEST_API_KEY:-}" ] && [ -f "$SECRETS_FILE" ]; then
  VAL="$(sed -n 's/^ATTEST_API_KEY=//p' "$SECRETS_FILE" | head -n 1)"
  if [ -n "$VAL" ]; then
    export ATTEST_API_KEY="$VAL"
  fi
fi

mkdir -p "${DATA_DIR:-/data}"
exec "$@"
