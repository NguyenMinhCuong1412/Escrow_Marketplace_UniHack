#!/bin/sh
set -eu

SECRETS_FILE="${FRONTEND_SECRETS_FILE:-/run/secrets-env/secrets.env}"
CLIENT_SECRETS_FILE="${CLIENT_SECRETS_FILE:-/run/client-secrets/session.env}"

IS_SHARED_MODE=0
BFF_MODE_LOWER="$(printf '%s' "${BFF_AUTH_MODE:-}" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"
SHARED_URL_TRIMMED="$(printf '%s' "${SHARED_API_URL:-}" | tr -d '[:space:]')"
if [ "$BFF_MODE_LOWER" = "shared" ] || [ -n "$SHARED_URL_TRIMMED" ]; then
  IS_SHARED_MODE=1
fi

read_env_key() {
  KEY_NAME="$1"
  FILE_PATH="$2"
  sed -n "s/^${KEY_NAME}=//p" "$FILE_PATH" | head -n 1 | tr -d '\r'
}

ensure_client_session_secret() {
  if [ -n "${SESSION_SECRET:-}" ]; then
    return 0
  fi

  TARGET_FILE="$CLIENT_SECRETS_FILE"
  TARGET_DIR="$(dirname "$TARGET_FILE")"

  if ! (umask 077 && mkdir -p "$TARGET_DIR" 2>/dev/null && chmod 700 "$TARGET_DIR" 2>/dev/null); then
    TARGET_DIR="/tmp/.escrow-client-secrets"
    TARGET_FILE="${TARGET_DIR}/session.env"
    umask 077 && mkdir -p "$TARGET_DIR" && chmod 700 "$TARGET_DIR"
  fi

  if [ -f "$TARGET_FILE" ]; then
    EXISTING="$(read_env_key "SESSION_SECRET" "$TARGET_FILE")"
    if [ "${#EXISTING}" -ge 32 ]; then
      chmod 600 "$TARGET_FILE" 2>/dev/null || true
      export SESSION_SECRET="$EXISTING"
      return 0
    fi
  fi

  GENERATED="$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")"
  TMP_FILE="${TARGET_FILE}.tmp.$$"
  (
    umask 077
    printf 'SESSION_SECRET=%s\n' "$GENERATED" > "$TMP_FILE"
    chmod 600 "$TMP_FILE"
  )
  mv -f "$TMP_FILE" "$TARGET_FILE"
  chmod 600 "$TARGET_FILE" 2>/dev/null || true
  export SESSION_SECRET="$GENERATED"
}

if [ "$IS_SHARED_MODE" -eq 1 ]; then
  # Shared Client zero-config: chỉ tự sinh/lưu bền SESSION_SECRET cục bộ;
  # tuyệt đối không nhận hoặc đọc ATTEST_API_KEY, OPS_JWT_SECRET, PINATA_JWT, AGENT_PRIVATE_KEY.
  unset ATTEST_API_KEY OPS_JWT_SECRET PINATA_JWT AGENT_PRIVATE_KEY 2>/dev/null || true
  ensure_client_session_secret
elif [ -f "$SECRETS_FILE" ]; then
  # Local/Dev & Ops Hosted-UI: chỉ nạp SESSION_SECRET và ATTEST_API_KEY (không đọc OPS_JWT_SECRET).
  if [ -z "${SESSION_SECRET:-}" ]; then
    VAL="$(read_env_key "SESSION_SECRET" "$SECRETS_FILE")"
    if [ -n "$VAL" ]; then
      export SESSION_SECRET="$VAL"
    fi
  fi
  if [ -z "${ATTEST_API_KEY:-}" ]; then
    VAL="$(read_env_key "ATTEST_API_KEY" "$SECRETS_FILE")"
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
