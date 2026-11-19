#!/bin/sh
set -eu

SECRETS_FILE="${BACKEND_SECRETS_FILE:-${SECRETS_FILE:-/run/secrets-env/secrets.env}}"

load_secret_var() {
  VAR_NAME="$1"
  FILE_VAR_NAME="${VAR_NAME}_FILE"
  eval "CURRENT_VAL=\${${VAR_NAME}:-}"
  if [ -n "$CURRENT_VAL" ]; then
    return 0
  fi

  eval "SECRET_PATH=\${${FILE_VAR_NAME}:-}"
  if [ -n "$SECRET_PATH" ] && [ -f "$SECRET_PATH" ]; then
    FILE_VAL="$(head -n 1 "$SECRET_PATH" | tr -d '\r\n')"
    if [ -n "$FILE_VAL" ]; then
      export "${VAR_NAME}=${FILE_VAL}"
      return 0
    fi
  fi

  if [ -f "$SECRETS_FILE" ]; then
    VAL="$(sed -n "s/^${VAR_NAME}=//p" "$SECRETS_FILE" | head -n 1 | tr -d '\r')"
    if [ -n "$VAL" ]; then
      export "${VAR_NAME}=${VAL}"
    fi
  fi
}

# Backend chỉ nạp ATTEST_API_KEY và OPS_JWT_SECRET (không bao giờ nạp SESSION_SECRET của Frontend)
load_secret_var "ATTEST_API_KEY"
load_secret_var "OPS_JWT_SECRET"

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
