#!/bin/sh
set -eu

SECRETS_FILE="/run/secrets-env/secrets.env"
if [ -z "${ATTEST_API_KEY:-}" ] && [ -f "$SECRETS_FILE" ]; then
  VAL="$(sed -n 's/^ATTEST_API_KEY=//p' "$SECRETS_FILE" | head -n 1)"
  if [ -n "$VAL" ]; then
    export ATTEST_API_KEY="$VAL"
  fi
fi

if [ -n "${CODESPACE_NAME:-}" ]; then
  CS_DOMAIN="${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
  CS_ORIGIN="https://${CODESPACE_NAME}-3000.${CS_DOMAIN}"
  case ",${CORS_ORIGINS:-}," in
    *,"${CS_ORIGIN}",*) ;;
    *)
      if [ -n "${CORS_ORIGINS:-}" ]; then
        export CORS_ORIGINS="${CORS_ORIGINS},${CS_ORIGIN}"
      else
        export CORS_ORIGINS="${CS_ORIGIN}"
      fi
      ;;
  esac
fi

mkdir -p "${DATA_DIR:-/data}"
exec "$@"
