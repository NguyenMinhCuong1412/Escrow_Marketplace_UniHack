"""
ops_auth.py
-----------
Shared Authentication (DEC-023): EIP-191 Challenge -> HS256 Ops JWT.

- Phát hành challenge ràng buộc ví, chain_id, domain/origin, thời hạn (iat/exp) và nonce dùng 1 lần.
- Kiểm chứng chữ ký EIP-191 phía Ops Server, tiêu thụ nonce nguyên tử trong SQLite WAL (`used_auth_nonces`),
  và cấp HS256 JWT ngắn hạn ký bằng `OPS_JWT_SECRET` (chỉ tồn tại trên Ops Server).
- Không dùng thư viện ngoài để giữ bề mặt phụ thuộc tối giản; enforce nghiêm ngặt `alg=HS256`,
  `typ`, `iss`, thời hạn `exp` và constant-time HMAC comparison.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import re
import secrets
import time
from dataclasses import dataclass
from typing import Any, Optional
from urllib.parse import urlsplit

from eth_account import Account
from eth_account.messages import encode_defunct
from web3 import Web3

ISSUER = "escrow-marketplace-ops"
MIN_OPS_JWT_SECRET_LEN = 32
DEFAULT_CHALLENGE_TTL_SECONDS = 300
MAX_CHALLENGE_TTL_SECONDS = 900
DEFAULT_SESSION_TTL_SECONDS = 86400
MAX_SESSION_TTL_SECONDS = 86400 * 7
TOKEN_TYP_CHALLENGE = "ops_challenge"
TOKEN_TYP_SESSION = "ops_session"

_DOMAIN_RE = re.compile(r"^[a-z0-9._:/-]{1,255}$")
_WALLET_RE = re.compile(r"^0x[0-9a-fA-F]{40}$")
_NONCE_RE = re.compile(r"^[A-Za-z0-9._-]{16,128}$")


class OpsAuthError(Exception):
    def __init__(self, status_code: int, error_code: str, message: str):
        self.status_code = int(status_code)
        self.error_code = str(error_code)
        self.message = str(message)
        super().__init__(message)


class OpsAuthConfigError(OpsAuthError):
    def __init__(self, message: str = "Shared Auth chưa được cấu hình OPS_JWT_SECRET hợp lệ."):
        super().__init__(503, "OPS_AUTH_UNCONFIGURED", message)


@dataclass(frozen=True)
class VerifiedOpsSession:
    address: str
    chain_id: int
    domain: str
    expires_at: int
    jti: str


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64url_decode(val: str) -> bytes:
    if not isinstance(val, str) or not val:
        raise OpsAuthError(401, "INVALID_TOKEN", "Token không hợp lệ.")
    pad = "=" * ((4 - len(val) % 4) % 4)
    try:
        return base64.urlsafe_b64decode((val + pad).encode("ascii"))
    except Exception as exc:
        raise OpsAuthError(401, "INVALID_TOKEN", "Token sai định dạng base64url.") from exc


def validate_ops_jwt_secret(secret: Optional[str], attest_api_key: Optional[str] = None) -> str:
    val = (secret or "").strip()
    if not val:
        raise OpsAuthConfigError("Thiếu OPS_JWT_SECRET trên Ops Backend.")
    if len(val) < MIN_OPS_JWT_SECRET_LEN:
        raise OpsAuthConfigError("OPS_JWT_SECRET phải có độ dài tối thiểu 32 ký tự.")
    if attest_api_key and val == attest_api_key.strip():
        raise OpsAuthConfigError("OPS_JWT_SECRET phải độc lập và không được trùng với ATTEST_API_KEY.")
    return val


def normalize_wallet_address(raw: str, field: str = "address") -> str:
    val = (raw or "").strip()
    if not _WALLET_RE.match(val):
        raise OpsAuthError(422, "INVALID_WALLET", f"{field} phải là địa chỉ ví EVM hợp lệ.")
    return val.lower()


def normalize_auth_domain(raw: Optional[str]) -> str:
    """Chuẩn hóa domain hoặc origin HTTP (scheme://host[:port] hoặc host[:port])."""
    val = (raw or "").strip()
    if not val or len(val) > 255 or any(c.isspace() for c in val):
        raise OpsAuthError(422, "INVALID_AUTH_DOMAIN", "Domain/Origin xác thực không hợp lệ.")
    if "://" in val:
        parsed = urlsplit(val)
        if parsed.scheme.lower() not in ("http", "https") or not parsed.netloc:
            raise OpsAuthError(422, "INVALID_AUTH_DOMAIN", "Origin xác thực phải là http:// hoặc https://.")
        if parsed.path not in ("", "/") or parsed.query or parsed.fragment or parsed.username or parsed.password:
            raise OpsAuthError(422, "INVALID_AUTH_DOMAIN", "Origin không được chứa path, query hoặc userinfo.")
        norm = f"{parsed.scheme.lower()}://{parsed.netloc.lower()}"
    else:
        parsed = urlsplit(f"http://{val}")
        if not parsed.netloc or parsed.path or parsed.query or parsed.fragment:
            raise OpsAuthError(422, "INVALID_AUTH_DOMAIN", "Domain xác thực không hợp lệ.")
        norm = parsed.netloc.lower()
    if not _DOMAIN_RE.match(norm):
        raise OpsAuthError(422, "INVALID_AUTH_DOMAIN", "Domain/Origin chứa ký tự không hợp lệ.")
    return norm


def resolve_request_auth_domain(
    explicit_domain: Optional[str],
    origin_header: Optional[str],
    referer_header: Optional[str],
    host_header: Optional[str],
    allowed_origins: Optional[list[str]] = None,
) -> str:
    """Ràng buộc domain/origin giữa payload, HTTP Origin/Host header và allowlist (nếu bật)."""
    norm_origin: Optional[str] = None
    if origin_header and origin_header.strip():
        norm_origin = normalize_auth_domain(origin_header)
    elif referer_header and referer_header.strip():
        try:
            ref = urlsplit(referer_header.strip())
            if ref.scheme and ref.netloc:
                norm_origin = normalize_auth_domain(f"{ref.scheme}://{ref.netloc}")
        except OpsAuthError:
            raise
        except Exception:
            raise OpsAuthError(422, "INVALID_AUTH_DOMAIN", "Referer header không hợp lệ.")

    if explicit_domain and explicit_domain.strip():
        norm_domain = normalize_auth_domain(explicit_domain)
        if norm_origin and norm_origin != norm_domain:
            # Chấp nhận trường hợp explicit_domain là netloc (host:port) khớp với origin header
            if urlsplit(norm_origin).netloc.lower() != norm_domain:
                raise OpsAuthError(403, "ORIGIN_MISMATCH", "Domain yêu cầu không khớp với Origin trình duyệt.")
    elif norm_origin:
        norm_domain = norm_origin
    elif host_header and host_header.strip():
        norm_domain = normalize_auth_domain(host_header)
    else:
        raise OpsAuthError(422, "MISSING_AUTH_DOMAIN", "Thiếu thông tin domain/origin để ràng buộc challenge.")

    if allowed_origins:
        normalized_allow = {normalize_auth_domain(o) for o in allowed_origins if o.strip()}
        domain_host = urlsplit(norm_domain if "://" in norm_domain else f"http://{norm_domain}").netloc.lower()
        allowed_match = (norm_domain in normalized_allow) or any(
            (urlsplit(o if "://" in o else f"http://{o}").netloc.lower() == domain_host)
            for o in normalized_allow
        )
        if not allowed_match:
            raise OpsAuthError(403, "ORIGIN_NOT_ALLOWED", "Domain/Origin không được phép xác thực trên hệ thống này.")

    return norm_domain


def build_ops_challenge_message(
    address: str,
    chain_id: int,
    domain: str,
    nonce: str,
    issued_at: int,
    expires_at: int,
) -> str:
    """Thông điệp EIP-191 gắn đủ ví, chain_id, domain/origin, thời hạn và nonce dùng 1 lần."""
    checksum_addr = Web3.to_checksum_address(normalize_wallet_address(address))
    return "\n".join(
        [
            "Escrow Marketplace Shared Authentication Challenge",
            "",
            "Vui lòng ký thông điệp này để xác thực phiên làm việc an toàn trên Escrow Marketplace.",
            "",
            f"Địa chỉ ví: {checksum_addr}",
            f"Chain ID: {int(chain_id)}",
            f"Domain: {domain}",
            f"Nonce: {nonce}",
            f"Issued At: {int(issued_at)}",
            f"Expires At: {int(expires_at)}",
            "",
            "Lưu ý: Thao tác này không tốn phí gas và không gửi bất kỳ giao dịch on-chain nào.",
        ]
    )


def encode_hs256_jwt(payload: dict[str, Any], secret: str) -> str:
    header_b64 = _b64url_encode(
        json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":"), sort_keys=True).encode("utf-8")
    )
    payload_b64 = _b64url_encode(
        json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    )
    signing_input = f"{header_b64}.{payload_b64}".encode("ascii")
    sig = hmac.new(secret.encode("utf-8"), signing_input, hashlib.sha256).digest()
    return f"{header_b64}.{payload_b64}.{_b64url_encode(sig)}"


def decode_hs256_jwt(
    token: str,
    secret: str,
    *,
    expected_typ: str,
    now: Optional[int] = None,
) -> dict[str, Any]:
    raw = (token or "").strip()
    parts = raw.split(".")
    if len(parts) != 3 or not all(parts):
        raise OpsAuthError(401, "INVALID_TOKEN", "JWT không hợp lệ.")
    header_b64, payload_b64, sig_b64 = parts

    try:
        header = json.loads(_b64url_decode(header_b64).decode("utf-8"))
        payload = json.loads(_b64url_decode(payload_b64).decode("utf-8"))
    except OpsAuthError:
        raise
    except Exception as exc:
        raise OpsAuthError(401, "INVALID_TOKEN", "Không đọc được nội dung JWT.") from exc

    if not isinstance(header, dict) or header.get("alg") != "HS256" or header.get("typ") != "JWT":
        raise OpsAuthError(401, "INVALID_TOKEN", "Thuật toán JWT không hợp lệ.")
    if not isinstance(payload, dict):
        raise OpsAuthError(401, "INVALID_TOKEN", "Payload JWT không hợp lệ.")

    signing_input = f"{header_b64}.{payload_b64}".encode("ascii")
    expected_sig = _b64url_encode(hmac.new(secret.encode("utf-8"), signing_input, hashlib.sha256).digest())
    if not hmac.compare_digest(sig_b64.encode("ascii"), expected_sig.encode("ascii")):
        raise OpsAuthError(401, "INVALID_TOKEN", "Chữ ký JWT không hợp lệ.")

    if payload.get("iss") != ISSUER or payload.get("typ") != expected_typ:
        raise OpsAuthError(401, "INVALID_TOKEN", "Token sai ngữ cảnh sử dụng.")

    ts = int(time.time()) if now is None else int(now)
    exp = payload.get("exp")
    iat = payload.get("iat")
    if not isinstance(exp, int) or isinstance(exp, bool) or not isinstance(iat, int) or isinstance(iat, bool):
        raise OpsAuthError(401, "INVALID_TOKEN", "Thiếu thông tin thời hạn JWT.")
    if exp <= ts:
        raise OpsAuthError(401, "TOKEN_EXPIRED", "Phiên đăng nhập hoặc challenge đã hết hạn.")

    return payload


def issue_auth_challenge(
    *,
    address: str,
    chain_id: int,
    domain: str,
    secret: str,
    ttl_seconds: int = DEFAULT_CHALLENGE_TTL_SECONDS,
    now: Optional[int] = None,
) -> dict[str, Any]:
    ts = int(time.time()) if now is None else int(now)
    eff_ttl = max(30, min(int(ttl_seconds), MAX_CHALLENGE_TTL_SECONDS))
    expires_at = ts + eff_ttl
    actor = normalize_wallet_address(address, "address")
    nonce = secrets.token_hex(16)
    message = build_ops_challenge_message(actor, chain_id, domain, nonce, ts, expires_at)

    challenge_payload = {
        "iss": ISSUER,
        "typ": TOKEN_TYP_CHALLENGE,
        "sub": actor,
        "chain_id": int(chain_id),
        "domain": domain,
        "nonce": nonce,
        "iat": ts,
        "exp": expires_at,
        "jti": secrets.token_hex(12),
    }
    challenge_token = encode_hs256_jwt(challenge_payload, secret)
    return {
        "nonce": nonce,
        "address": Web3.to_checksum_address(actor),
        "chain_id": int(chain_id),
        "domain": domain,
        "issued_at": ts,
        "expires_at": expires_at,
        "message": message,
        "challenge_token": challenge_token,
    }


def verify_challenge_and_issue_jwt(
    *,
    db: Any,
    address: str,
    chain_id: int,
    nonce: str,
    signature: str,
    challenge_token: str,
    domain: str,
    secret: str,
    active_chain_id: int,
    session_ttl_seconds: int = DEFAULT_SESSION_TTL_SECONDS,
    now: Optional[int] = None,
) -> dict[str, Any]:
    ts = int(time.time()) if now is None else int(now)
    actor = normalize_wallet_address(address, "address")
    req_nonce = (nonce or "").strip()
    if not _NONCE_RE.match(req_nonce):
        raise OpsAuthError(401, "INVALID_CHALLENGE", "Nonce challenge không hợp lệ.")
    if not signature or not isinstance(signature, str):
        raise OpsAuthError(401, "INVALID_SIGNATURE", "Thiếu chữ ký ví EIP-191.")

    if int(chain_id) != int(active_chain_id):
        raise OpsAuthError(409, "CHAIN_MISMATCH", "Mạng ví không khớp với mạng đang phục vụ.")

    claims = decode_hs256_jwt(
        challenge_token,
        secret,
        expected_typ=TOKEN_TYP_CHALLENGE,
        now=ts,
    )

    if (
        str(claims.get("sub", "")).lower() != actor
        or int(claims.get("chain_id", -1)) != int(chain_id)
        or str(claims.get("nonce", "")) != req_nonce
        or str(claims.get("domain", "")) != domain
    ):
        raise OpsAuthError(401, "CHALLENGE_MISMATCH", "Thông tin xác thực không khớp với challenge đã cấp.")

    iat = int(claims["iat"])
    exp = int(claims["exp"])
    canonical_msg = build_ops_challenge_message(actor, int(chain_id), domain, req_nonce, iat, exp)

    try:
        recovered = Account.recover_message(encode_defunct(text=canonical_msg), signature=signature.strip())
    except Exception as exc:
        raise OpsAuthError(401, "INVALID_SIGNATURE", "Không xác thực được chữ ký EIP-191.") from exc

    if str(recovered).lower() != actor:
        raise OpsAuthError(401, "INVALID_SIGNATURE", "Chữ ký ví không khớp với địa chỉ ví.")

    if not db.consume_auth_nonce(req_nonce, actor, domain, exp, now=ts):
        raise OpsAuthError(401, "CHALLENGE_REPLAYED", "Challenge đã được sử dụng (chống replay).")

    eff_sess_ttl = max(60, min(int(session_ttl_seconds), MAX_SESSION_TTL_SECONDS))
    sess_exp = ts + eff_sess_ttl
    jti = secrets.token_hex(16)
    session_payload = {
        "iss": ISSUER,
        "typ": TOKEN_TYP_SESSION,
        "sub": actor,
        "chain_id": int(chain_id),
        "domain": domain,
        "iat": ts,
        "exp": sess_exp,
        "jti": jti,
    }
    ops_token = encode_hs256_jwt(session_payload, secret)
    return {
        "ok": True,
        "ops_token": ops_token,
        "token_type": "Bearer",
        "address": Web3.to_checksum_address(actor),
        "chain_id": int(chain_id),
        "domain": domain,
        "expires_at": sess_exp,
    }


def verify_ops_session_jwt(
    token: str,
    *,
    secret: str,
    expected_chain_id: int,
    now: Optional[int] = None,
) -> VerifiedOpsSession:
    claims = decode_hs256_jwt(
        token,
        secret,
        expected_typ=TOKEN_TYP_SESSION,
        now=now,
    )
    actor = normalize_wallet_address(str(claims.get("sub", "")), "sub")
    tok_chain = claims.get("chain_id")
    if not isinstance(tok_chain, int) or isinstance(tok_chain, bool):
        raise OpsAuthError(401, "INVALID_TOKEN", "Token thiếu chain_id.")
    if int(tok_chain) != int(expected_chain_id):
        raise OpsAuthError(409, "CHAIN_MISMATCH", "Phiên đăng nhập không khớp với mạng đang phục vụ.")

    domain = normalize_auth_domain(str(claims.get("domain", "")))
    jti = str(claims.get("jti", ""))
    if not jti:
        raise OpsAuthError(401, "INVALID_TOKEN", "Token thiếu jti.")

    return VerifiedOpsSession(
        address=actor,
        chain_id=int(tok_chain),
        domain=domain,
        expires_at=int(claims["exp"]),
        jti=jti,
    )
