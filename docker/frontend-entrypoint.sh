#!/bin/sh
set -eu

SECRETS_FILE="/run/secrets-env/secrets.env"
if [ -f "$SECRETS_FILE" ]; then
  if [ -z "${SESSION_SECRET:-}" ]; then
    VAL="$(sed -n 's/^SESSION_SECRET=//p' "$SECRETS_FILE" | head -n 1)"
    if [ -n "$VAL" ]; then
      export SESSION_SECRET="$VAL"
    fi
  fi
  if [ -z "${ATTEST_API_KEY:-}" ]; then
    VAL="$(sed -n 's/^ATTEST_API_KEY=//p' "$SECRETS_FILE" | head -n 1)"
    if [ -n "$VAL" ]; then
      export ATTEST_API_KEY="$VAL"
    fi
  fi
fi

exec "$@"
