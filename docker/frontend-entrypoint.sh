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

if [ -n "${CODESPACE_NAME:-}" ]; then
  CS_DOMAIN="${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
  CS_ORIGIN="https://${CODESPACE_NAME}-3000.${CS_DOMAIN}"
  case ",${ALLOWED_ORIGINS:-}," in
    *,"${CS_ORIGIN}",*) ;;
    *)
      if [ -n "${ALLOWED_ORIGINS:-}" ]; then
        export ALLOWED_ORIGINS="${ALLOWED_ORIGINS},${CS_ORIGIN}"
      else
        export ALLOWED_ORIGINS="${CS_ORIGIN}"
      fi
      ;;
  esac
fi

exec "$@"
