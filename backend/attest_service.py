"""
attest_service.py
------------------
Backend AI attest. Hai cách kích hoạt, dùng CHUNG một lõi xác thực (run_verification):

* Thủ công (DEC-005 phương án B): POST /verify-evidence — client gửi 3 URI.
* Tự động (DEC-005 phương án A, bật bằng AGENT_AUTO=true): agent chạy nền trong
  auto_agent.py tự quét contract, giao dịch nào đủ bằng chứng + đủ URI đã đăng ký
  (POST /trade/{id}/uris) thì tự verify và tự attest. Xem GET /agent/status/{id}.

Lõi xác thực:
  1. Đọc giao dịch TỪ CHAIN (không tin dữ liệu client gửi): state, nonce,
     itemValue, evidence hash, reputation hai bên.
  2. Kiểm tra keccak256(evidenceUri) khớp hash đã neo on-chain → không ai đổi
     ảnh sau khi đã submitEvidence().
  3. Tải ảnh/video (ipfs:// tự đổi sang gateway), giới hạn dung lượng.
  4. Chạy ai-pipeline/evidence_check.analyze_evidence (Vai 1 → 4).
  5. Ký + gửi attest(tradeId, riskScore, flagged, reportHash) bằng ví agent.
  6. Lưu report JSON (GET /report/{id}) để frontend hiển thị Explainable Evidence
     Report và tự tính lại keccak256 đối chiếu reportHash on-chain.

Chạy:  cd backend && uvicorn attest_service:app --port 8000
Cấu hình: xem backend/.env.example (AGENT_PRIVATE_KEY KHÔNG BAO GIỜ commit).
"""

from __future__ import annotations

import email.parser
import email.policy
import hashlib
import hmac
import ipaddress
import json
import logging
import os
import re
import socket
import sys
import tempfile
import threading
import time
import uuid
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal, Optional
from urllib.parse import urlparse, urljoin

import requests
from fastapi import FastAPI, HTTPException, Request, Header, Response
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import AliasChoices, BaseModel, Field
from web3 import Web3

BACKEND_DIR = Path(__file__).resolve().parent
ROOT_DIR = BACKEND_DIR.parent
sys.path.insert(0, str(BACKEND_DIR))
sys.path.insert(0, str(ROOT_DIR / "ai-pipeline"))  # thư mục có dấu "-" nên không import dạng package được

import evidence_check as ec  # noqa: E402
import imagehash  # noqa: E402
from chain import (  # noqa: E402
    ChainError, EscrowClient, TradeState, evidence_hash_of, find_escrow_address, load_abi,
)

from auto_agent import AutoAgent, UriConflict, UriRegistry, listing_message, recover_signer  # noqa: E402
from db import MarketplaceDB  # noqa: E402
from trade_indexer import TradeIndexer, is_trade_index_enabled  # noqa: E402
from ops_auth import (  # noqa: E402
    OpsAuthConfigError,
    OpsAuthError,
    TOKEN_TYP_SESSION,
    decode_hs256_jwt,
    issue_auth_challenge,
    resolve_request_auth_domain,
    validate_ops_jwt_secret,
    verify_challenge_and_issue_jwt,
    verify_ops_session_jwt,
)
from pin_relay import (  # noqa: E402
    MAX_VIDEO_BYTES,
    PinataRelayError,
    handle_pin_upload,
)
from listings import (  # noqa: E402
    BindTradeRequest,
    CancelRequestBody,
    CreateListingRequest,
    CreatePurchaseRequest,
    DecisionRequest,
    MarketplaceError,
    MarketplaceService,
    UpdateListingRequest,
    compute_proxy_signature,
    normalize_wallet,
)

log = logging.getLogger("attest")


# ---------------------------------------------------------------------------
# Cấu hình
# ---------------------------------------------------------------------------

def _load_dotenv() -> None:
    try:
        from dotenv import load_dotenv
    except ImportError:  # pragma: no cover
        return
    for p in (BACKEND_DIR / ".env", ROOT_DIR / ".env"):
        if p.exists():
            load_dotenv(p, override=False)


def _env_bool(name: str, default: bool) -> bool:
    v = os.environ.get(name)
    return default if v is None else v.strip().lower() in ("1", "true", "yes", "on")


@dataclass
class Settings:
    rpc_url: Optional[str] = None
    agent_private_key: Optional[str] = None
    escrow_address: Optional[str] = None
    escrow_abi_path: Path = ROOT_DIR / "contracts" / "out" / "Escrow.sol" / "Escrow.json"
    deployments_dir: Path = ROOT_DIR / "contracts" / "deployments"
    data_dir: Path = BACKEND_DIR / "data"
    ipfs_gateway: str = "https://gateway.pinata.cloud/ipfs/"
    max_download_mb: int = 50
    allowed_hosts: list[str] = field(default_factory=list)  # rỗng = chỉ cho phép host từ ipfs_gateway
    allow_local_hosts: bool = False  # True: cho phép IP nội bộ/loopback (chỉ dùng cho local dev/test)
    attest_api_key: Optional[str] = None
    enforce_evidence_hash: bool = True
    cors_origins: list[str] = field(default_factory=list)  # rỗng = không cho phép origin nào
    download_timeout: int = 30
    agent_auto: bool = False          # True: agent chạy nền tự verify + attest (DEC-005 phương án A)
    agent_poll_seconds: float = 5.0
    chain_id: Optional[int] = None
    reservation_ttl_seconds: int = 1800
    inspect_listing_images: bool = False
    require_proxy_signature: bool = False
    proxy_sig_ttl_seconds: int = 300
    trust_proxy_forwarded_for: bool = False
    verify_chain_before_ttl_release: bool = True
    worker_lease_ttl_seconds: float = 60.0
    trade_lock_ttl_seconds: float = 300.0
    reconcile_poll_seconds: float = 0.0
    worker_id: Optional[str] = None
    # Phase 2: Shared Auth (DEC-023), Pinata Relay (DEC-024), Verify Worker Delegation (DEC-025) & Polling
    enable_shared_auth: bool = False
    ops_jwt_secret: Optional[str] = None
    ops_auth_allowed_origins: list[str] = field(default_factory=list)
    ops_auth_challenge_ttl_seconds: int = 300
    ops_auth_session_ttl_seconds: int = 86400
    pinata_jwt: Optional[str] = None
    pinata_url: str = "https://api.pinata.cloud/pinning/pinFileToIPFS"
    pin_quota_window_seconds: int = 3600
    pin_max_wallet_files: int = 20
    pin_max_wallet_bytes: int = 150 * 1024 * 1024
    pin_max_ip_files: int = 40
    pin_max_ip_bytes: int = 300 * 1024 * 1024
    verify_job_wait_timeout_seconds: float = 45.0
    verify_job_poll_interval_seconds: float = 0.2
    verify_trade_cooldown_seconds: int = 20
    read_rate_limit_per_min: int = 240

    @classmethod
    def from_env(cls) -> "Settings":
        _load_dotenv()
        cors_val = os.environ.get("CORS_ORIGINS", "")
        cors_origins = [o.strip() for o in cors_val.split(",") if o.strip()]
        ops_origins_val = os.environ.get("OPS_AUTH_ALLOWED_ORIGINS", "")
        ops_auth_allowed_origins = [o.strip() for o in ops_origins_val.split(",") if o.strip()]
        s = cls(
            rpc_url=os.environ.get("RPC_URL"),
            agent_private_key=os.environ.get("AGENT_PRIVATE_KEY"),
            escrow_address=os.environ.get("ESCROW_ADDRESS") or None,
            ipfs_gateway=os.environ.get("IPFS_GATEWAY", cls.ipfs_gateway),
            max_download_mb=int(os.environ.get("MAX_DOWNLOAD_MB", cls.max_download_mb)),
            allowed_hosts=[h.strip().lower() for h in os.environ.get("ALLOWED_HOSTS", "").split(",") if h.strip()],
            allow_local_hosts=_env_bool("ALLOW_LOCAL_HOSTS", False),
            attest_api_key=os.environ.get("ATTEST_API_KEY") or None,
            enforce_evidence_hash=_env_bool("ENFORCE_EVIDENCE_HASH", True),
            cors_origins=cors_origins,
            agent_auto=_env_bool("AGENT_AUTO", False),
            agent_poll_seconds=float(os.environ.get("AGENT_POLL_SECONDS", cls.agent_poll_seconds)),
            chain_id=int(os.environ["CHAIN_ID"]) if os.environ.get("CHAIN_ID") else None,
            reservation_ttl_seconds=int(os.environ.get("RESERVATION_TTL_SECONDS", cls.reservation_ttl_seconds)),
            inspect_listing_images=_env_bool("INSPECT_LISTING_IMAGES", True),
            require_proxy_signature=_env_bool("REQUIRE_PROXY_SIGNATURE", False),
            proxy_sig_ttl_seconds=int(os.environ.get("PROXY_SIG_TTL_SECONDS", cls.proxy_sig_ttl_seconds)),
            trust_proxy_forwarded_for=_env_bool("TRUST_PROXY_FORWARDED_FOR", False),
            verify_chain_before_ttl_release=_env_bool("VERIFY_CHAIN_BEFORE_TTL_RELEASE", True),
            worker_lease_ttl_seconds=float(os.environ.get("WORKER_LEASE_TTL_SECONDS", cls.worker_lease_ttl_seconds)),
            trade_lock_ttl_seconds=float(os.environ.get("TRADE_LOCK_TTL_SECONDS", cls.trade_lock_ttl_seconds)),
            reconcile_poll_seconds=float(os.environ.get("RECONCILE_POLL_SECONDS", cls.reconcile_poll_seconds)),
            worker_id=os.environ.get("WORKER_ID") or None,
            enable_shared_auth=_env_bool("ENABLE_SHARED_AUTH", False),
            ops_jwt_secret=os.environ.get("OPS_JWT_SECRET") or None,
            ops_auth_allowed_origins=ops_auth_allowed_origins,
            ops_auth_challenge_ttl_seconds=int(os.environ.get("OPS_AUTH_CHALLENGE_TTL_SECONDS", cls.ops_auth_challenge_ttl_seconds)),
            ops_auth_session_ttl_seconds=int(os.environ.get("OPS_AUTH_SESSION_TTL_SECONDS", cls.ops_auth_session_ttl_seconds)),
            pinata_jwt=os.environ.get("PINATA_JWT") or None,
            pinata_url=os.environ.get("PINATA_URL", cls.pinata_url),
            pin_quota_window_seconds=int(os.environ.get("PIN_QUOTA_WINDOW_SECONDS", cls.pin_quota_window_seconds)),
            pin_max_wallet_files=int(os.environ.get("PIN_MAX_WALLET_FILES", cls.pin_max_wallet_files)),
            pin_max_wallet_bytes=int(os.environ.get("PIN_MAX_WALLET_BYTES", cls.pin_max_wallet_bytes)),
            pin_max_ip_files=int(os.environ.get("PIN_MAX_IP_FILES", cls.pin_max_ip_files)),
            pin_max_ip_bytes=int(os.environ.get("PIN_MAX_IP_BYTES", cls.pin_max_ip_bytes)),
            verify_job_wait_timeout_seconds=float(os.environ.get("VERIFY_JOB_WAIT_TIMEOUT_SECONDS", cls.verify_job_wait_timeout_seconds)),
            verify_job_poll_interval_seconds=float(os.environ.get("VERIFY_JOB_POLL_INTERVAL_SECONDS", cls.verify_job_poll_interval_seconds)),
            verify_trade_cooldown_seconds=int(os.environ.get("VERIFY_TRADE_COOLDOWN_SECONDS", cls.verify_trade_cooldown_seconds)),
            read_rate_limit_per_min=int(os.environ.get("READ_RATE_LIMIT_PER_MIN", cls.read_rate_limit_per_min)),
        )
        if os.environ.get("ESCROW_ABI_PATH"):
            s.escrow_abi_path = Path(os.environ["ESCROW_ABI_PATH"])
        if os.environ.get("DATA_DIR"):
            s.data_dir = Path(os.environ["DATA_DIR"])
        if not s.escrow_abi_path.exists():
            fallback = BACKEND_DIR / "abi" / "Escrow.json"
            if fallback.exists():
                s.escrow_abi_path = fallback
        return s


# ---------------------------------------------------------------------------
# Fail-closed Security Guard (FREEZE-001 / Rule 30 / Rule 70)
# ---------------------------------------------------------------------------

class InsecureConfigError(HTTPException):
    def __init__(self, reasons: list[str]):
        self.reasons = list(reasons)
        self.error_code = "INSECURE_CONFIG"
        super().__init__(
            status_code=503,
            detail={
                "error_code": "INSECURE_CONFIG",
                "message": f"Insecure configuration for chain: {', '.join(reasons)}",
                "reasons": self.reasons,
            },
        )


def insecure_reasons(settings: Settings, chain_id: Optional[int]) -> list[str]:
    """Trả danh sách cấu hình không an toàn khi chain_id != 31337 (FREEZE-001 / Rule 30 / Rule 70).
    Trả [] khi chain_id == 31337 (local anvil)."""
    if chain_id == 31337:
        return []
    reasons: list[str] = []
    if not settings.attest_api_key or not settings.attest_api_key.strip():
        reasons.append("ATTEST_API_KEY is empty")
    if settings.allow_local_hosts:
        reasons.append("ALLOW_LOCAL_HOSTS is True")
    if not settings.enforce_evidence_hash:
        reasons.append("ENFORCE_EVIDENCE_HASH is False")
    if not getattr(settings, "verify_chain_before_ttl_release", True):
        reasons.append("VERIFY_CHAIN_BEFORE_TTL_RELEASE is False")
    if not getattr(settings, "require_proxy_signature", False):
        reasons.append("REQUIRE_PROXY_SIGNATURE is False")
    if getattr(settings, "enable_shared_auth", False):
        try:
            validate_ops_jwt_secret(settings.ops_jwt_secret, settings.attest_api_key)
        except OpsAuthConfigError as exc:
            reasons.append(exc.message)
    return reasons


def extract_gateway_host(gw: str) -> str:
    if not gw:
        return ""
    if "://" not in gw:
        gw = "http://" + gw
    from urllib.parse import urlsplit
    return urlsplit(gw).hostname or gw


# ---------------------------------------------------------------------------
# Kho pHash đã biết (Vai 1) — ưu tiên SQLite WAL dùng chung, fallback JSON khi db=None
# ---------------------------------------------------------------------------

class KnownHashStore:
    def __init__(self, path: Path, db: Optional[MarketplaceDB] = None):
        self.path = path
        self._db = db
        self._lock = threading.Lock()
        self._items: list[dict] = []
        if self._db is None and path.exists():
            try:
                self._items = json.loads(path.read_text(encoding="utf-8"))
            except Exception:
                log.warning("known_hashes.json hỏng, bắt đầu kho rỗng")

    def hashes_excluding(self, trade_id: int) -> tuple[list[imagehash.ImageHash], list[dict]]:
        """Bỏ qua hash của chính giao dịch này (verify lại không bị tính là tái sử dụng)."""
        if self._db is not None:
            rows = self._db.list_known_phashes(exclude_trade_id=trade_id)
            return [imagehash.hex_to_hash(r["phash"]) for r in rows], rows
        with self._lock:
            rows = [r for r in self._items if r["trade_id"] != trade_id]
        return [imagehash.hex_to_hash(r["phash"]) for r in rows], rows

    def add(self, trade_id: int, role: str, phash: str) -> None:
        if self._db is not None:
            self._db.add_known_phash(trade_id, role, phash)
            return
        with self._lock:
            if any(r["trade_id"] == trade_id and r["role"] == role for r in self._items):
                return
            self._items.append({"trade_id": trade_id, "role": role, "phash": phash, "ts": int(time.time())})
            self.path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.path.with_suffix(".tmp")
            tmp.write_text(json.dumps(self._items), encoding="utf-8")
            tmp.replace(self.path)

    def __len__(self) -> int:
        if self._db is not None:
            return self._db.count_known_phashes()
        return len(self._items)


# ---------------------------------------------------------------------------
# Tải bằng chứng & SSRF Protection
# ---------------------------------------------------------------------------

class DownloadError(Exception):
    pass


_CT_EXT = {
    "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/bmp": ".bmp",
    "video/mp4": ".mp4", "video/quicktime": ".mov", "video/webm": ".webm", "video/x-msvideo": ".avi",
}

ALLOWED_CONTENT_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "video/mp4",
    "application/octet-stream",
}

_RESTRICTED_NETWORKS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("100.64.0.0/10"),
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fe80::/10"),
]


def check_ip_ssrf(ip_str: str, allow_local_hosts: bool = False) -> None:
    """Kiểm tra IP có thuộc dải private/loopback/link-local/metadata không."""
    if allow_local_hosts:
        return
    try:
        ip = ipaddress.ip_address(ip_str)
    except ValueError:
        raise DownloadError(f"IP không hợp lệ: {ip_str}")

    if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_unspecified:
        raise DownloadError(f"IP {ip_str} thuộc dải bị chặn (SSRF protection)")

    for net in _RESTRICTED_NETWORKS:
        if ip in net:
            raise DownloadError(f"IP {ip_str} thuộc dải bị chặn (SSRF protection)")


def validate_host_dns_and_ip(host: str, allow_local_hosts: bool = False) -> None:
    """Phân giải DNS của host và kiểm tra các địa chỉ IP tương ứng."""
    if allow_local_hosts:
        return
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror as e:
        raise DownloadError(f"Không thể resolve host {host}: {e}")
    if not infos:
        raise DownloadError(f"Không tìm thấy địa chỉ IP cho host {host}")
    for info in infos:
        ip_str = info[4][0]
        check_ip_ssrf(ip_str, allow_local_hosts)


def resolve_url(uri: str, settings: Settings) -> str:
    """ipfs://CID[/path] → gateway; chỉ cho http(s); kiểm tra allowlist host."""
    if uri.startswith("ipfs://"):
        uri = settings.ipfs_gateway.rstrip("/") + "/" + uri[len("ipfs://"):].lstrip("/")
    parsed = urlparse(uri)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise DownloadError(f"URL không hợp lệ (chỉ http/https/ipfs): {uri}")
    host = (parsed.hostname or "").lower()

    effective_allowed = [h.lower() for h in settings.allowed_hosts] if settings.allowed_hosts else []
    if not effective_allowed:
        gw_host = (urlparse(settings.ipfs_gateway).hostname or "").lower()
        if gw_host:
            effective_allowed = [gw_host]

    if host not in effective_allowed:
        raise DownloadError(f"Host không nằm trong ALLOWED_HOSTS: {host}")
    return uri


def download(uri: str, settings: Settings, workdir: str, name: str) -> str:
    url = resolve_url(uri, settings)
    parsed = urlparse(url)
    validate_host_dns_and_ip(parsed.hostname or "", settings.allow_local_hosts)

    limit = settings.max_download_mb * 1024 * 1024
    session = requests.Session()
    current_url = url
    resp = None
    redirect_count = 0
    MAX_REDIRECTS = 3

    try:
        while True:
            resp = session.get(current_url, stream=True, timeout=settings.download_timeout, allow_redirects=False)
            if resp.is_redirect or resp.status_code in (301, 302, 303, 307, 308):
                redirect_count += 1
                if redirect_count > MAX_REDIRECTS:
                    raise DownloadError(f"Vượt quá số lần redirect tối đa ({MAX_REDIRECTS})")
                location = resp.headers.get("Location")
                if not location:
                    raise DownloadError("Redirect response thiếu Location header")
                next_url = urljoin(current_url, location)
                # Validate redirect target host and IP
                resolve_url(next_url, settings)
                next_parsed = urlparse(next_url)
                validate_host_dns_and_ip(next_parsed.hostname or "", settings.allow_local_hosts)
                current_url = next_url
                continue
            resp.raise_for_status()
            break

        ctype = resp.headers.get("Content-Type", "").split(";")[0].strip().lower()
        if ctype not in ALLOWED_CONTENT_TYPES:
            raise DownloadError(f"Content-Type không được phép: {ctype}")

        ext = _CT_EXT.get(ctype) or os.path.splitext(urlparse(current_url).path)[1].lower() or ".jpg"
        if int(resp.headers.get("Content-Length") or 0) > limit:
            raise DownloadError(f"File quá lớn (> {settings.max_download_mb} MB): {uri}")
        path = os.path.join(workdir, name + ext)
        size = 0
        with open(path, "wb") as f:
            for chunk in resp.iter_content(64 * 1024):
                size += len(chunk)
                if size > limit:
                    raise DownloadError(f"File quá lớn (> {settings.max_download_mb} MB): {uri}")
                f.write(chunk)
    except DownloadError:
        raise
    except requests.RequestException as e:
        raise DownloadError(f"Không tải được {uri}: {e}") from e
    finally:
        if resp is not None:
            resp.close()
        session.close()

    if size == 0:
        raise DownloadError(f"File rỗng: {uri}")
    return path


# ---------------------------------------------------------------------------
# API models
# ---------------------------------------------------------------------------

class VerifyRequest(BaseModel):
    trade_id: int = Field(gt=0)
    listing_image_url: str
    seller_evidence_url: str = Field(validation_alias=AliasChoices("seller_evidence_url", "seller_evidence_image_url"))
    buyer_evidence_url: str = Field(validation_alias=AliasChoices("buyer_evidence_url", "buyer_evidence_keyframe_url"))
    dry_run: bool = False  # True: chạy pipeline, KHÔNG gửi attest() (xem trước / debug)
    include_visual: bool = True


class AuthChallengeRequest(BaseModel):
    address: str = Field(min_length=42, max_length=42)
    chain_id: Optional[int] = None
    domain: Optional[str] = Field(default=None, max_length=255)


class AuthVerifyRequest(BaseModel):
    address: str = Field(min_length=42, max_length=42)
    chain_id: Optional[int] = None
    nonce: str = Field(min_length=16, max_length=128)
    signature: str = Field(min_length=10, max_length=512)
    challenge_token: str = Field(min_length=10, max_length=4096)
    domain: Optional[str] = Field(default=None, max_length=255)


class UriRequest(BaseModel):
    role: Literal["listing", "seller", "buyer"]
    uri: str = Field(min_length=8, max_length=2048)
    signature: Optional[str] = None  # bắt buộc với role="listing": chữ ký ví của seller


class VerifyResponse(BaseModel):
    trade_id: int
    report: dict
    report_hash: str
    report_json: str           # chuỗi canonical đã băm — frontend keccak256 lại để đối chiếu
    attested: bool
    tx_hash: Optional[str] = None
    match_visual_png_b64: Optional[str] = None
    duration_ms: int


# ---------------------------------------------------------------------------
# Shared Backend Runtime (dùng chung cho FastAPI API và standalone worker.py)
# ---------------------------------------------------------------------------

class BackendRuntime:
    """Khởi tạo và quản lý DB dùng chung, migration JSON cũ, chain clients và lõi verify."""

    def __init__(
        self,
        settings: Settings,
        client: Optional[EscrowClient] = None,
        *,
        reconcile_interval_seconds: Optional[float] = None,
        pin_uploader=None,
    ):
        self.settings = settings
        self.reports_dir = settings.data_dir / "reports"
        self.db = MarketplaceDB(settings.data_dir / "marketplace.db")
        self.migration_summary = self.db.migrate_legacy_json_stores(settings.data_dir)
        self.store = KnownHashStore(settings.data_dir / "known_hashes.json", db=self.db)
        self.registry = UriRegistry(settings.data_dir / "trade_uris.json", db=self.db)
        self.marketplace = MarketplaceService(db=self.db, settings=settings, download_fn=download)
        self.trade_indexer = TradeIndexer(
            db=self.db,
            deployments_dir=settings.deployments_dir,
            max_block_lag=max(0, int(os.environ.get("TRADE_INDEX_MAX_BLOCK_LAG", "20"))),
            max_stale_seconds=max(1.0, float(os.environ.get("TRADE_INDEX_MAX_STALE_SECONDS", "45"))),
        )
        self.state: dict = {"client": client, "readonly_client": client}
        self.pin_uploader = pin_uploader
        self._trade_locks: dict[int, threading.Lock] = {}
        self._trade_locks_guard = threading.Lock()
        self._verify_cooldowns: dict[tuple[str, int], float] = {}
        self._verify_cooldowns_guard = threading.Lock()

        eff_reconcile_interval = (
            settings.reconcile_poll_seconds
            if reconcile_interval_seconds is None
            else float(reconcile_interval_seconds)
        )
        self.agent = AutoAgent(
            self.get_client,
            self.registry,
            self._agent_verify,
            settings.agent_poll_seconds,
            reconcile=self.reconcile_marketplace_readonly,
            process_verify_jobs=self.process_pending_verify_jobs,
            sync_trade_index=self.sync_trade_index_readonly,
            db=self.db,
            worker_id=settings.worker_id,
            lease_ttl_seconds=settings.worker_lease_ttl_seconds,
            reconcile_interval_seconds=eff_reconcile_interval,
        )

    def _resolve_escrow_address(self, rpc_url: str) -> str:
        address = self.settings.escrow_address
        if not address:
            cid = self.settings.chain_id
            if cid is None:
                try:
                    cid = int(Web3(Web3.HTTPProvider(rpc_url, request_kwargs={"timeout": 10})).eth.chain_id)
                except Exception as exc:
                    raise HTTPException(502, f"RPC error: {exc}")
            address = find_escrow_address(self.settings.deployments_dir, cid)
            if not address:
                raise HTTPException(503, f"Thiếu ESCROW_ADDRESS và không có contracts/deployments/{cid}.json")
        return address

    def get_client(self) -> EscrowClient:
        """Signing client cho attest() — bắt buộc có RPC_URL và AGENT_PRIVATE_KEY."""
        if self.state["client"] is not None:
            return self.state["client"]
        missing = [
            k for k, v in (("RPC_URL", self.settings.rpc_url), ("AGENT_PRIVATE_KEY", self.settings.agent_private_key))
            if not v
        ]
        if missing:
            raise HTTPException(503, f"Thiếu cấu hình: {', '.join(missing)} (xem backend/.env.example)")
        if not self.settings.escrow_abi_path.exists():
            raise HTTPException(503, f"Không thấy ABI tại {self.settings.escrow_abi_path} — chạy `forge build` trong contracts/")
        abi = load_abi(self.settings.escrow_abi_path)
        address = self._resolve_escrow_address(self.settings.rpc_url)
        self.state["client"] = EscrowClient(self.settings.rpc_url, address, abi, self.settings.agent_private_key)
        self.state["readonly_client"] = self.state["client"]
        log.info("Kết nối Escrow %s, agent %s", address, self.state["client"].agent_address)
        return self.state["client"]

    def require_readonly_client(self) -> EscrowClient:
        """Read-only chain client cho các endpoint chỉ đọc — KHÔNG cần AGENT_PRIVATE_KEY."""
        if self.state["client"] is not None:
            return self.state["client"]
        if self.state["readonly_client"] is not None:
            return self.state["readonly_client"]
        if not self.settings.rpc_url:
            raise HTTPException(503, "Thiếu cấu hình: RPC_URL (xem backend/.env.example)")
        if self.settings.agent_private_key:
            return self.get_client()
        if not self.settings.escrow_abi_path.exists():
            raise HTTPException(503, f"Không thấy ABI tại {self.settings.escrow_abi_path} — chạy `forge build` trong contracts/")
        abi = load_abi(self.settings.escrow_abi_path)
        address = self._resolve_escrow_address(self.settings.rpc_url)
        rc = EscrowClient(self.settings.rpc_url, address, abi, agent_private_key=None)
        self.state["readonly_client"] = rc
        log.info("Kết nối Escrow read-only %s", address)
        return rc

    def get_readonly_client(self) -> Optional[EscrowClient]:
        try:
            return self.require_readonly_client()
        except HTTPException:
            return None

    def get_chain_id(self, c: EscrowClient) -> int:
        if self.state.get("chain_id") is None:
            if hasattr(c, "chain_id") and callable(c.chain_id):
                self.state["chain_id"] = int(c.chain_id())
            else:
                self.state["chain_id"] = 31337
        return self.state["chain_id"]

    def check_security_guard(self, c: EscrowClient) -> None:
        cid = self.get_chain_id(c)
        reasons = insecure_reasons(self.settings, cid)
        if reasons:
            raise InsecureConfigError(reasons)

    def active_chain_context(self, require_client: bool = False) -> tuple[int, str, Optional[EscrowClient]]:
        """Trả (chain_id, escrow_address_lower, client_or_none) và luôn kiểm tra fail-closed guard.
        Các thao tác marketplace (bind-trade, sync, reconcile) chỉ đọc chain nên dùng read-only client."""
        if require_client or self.state["client"] is not None:
            c = self.require_readonly_client()
            self.check_security_guard(c)
            cid = self.get_chain_id(c)
            esc = (
                (c.escrow.address if hasattr(c, "escrow") and hasattr(c.escrow, "address") else None)
                or self.settings.escrow_address
                or find_escrow_address(self.settings.deployments_dir, cid)
                or "0x0000000000000000000000000000000000000000"
            )
            return cid, esc.lower(), c

        if self.settings.rpc_url:
            known_cid = self.state.get("chain_id") if self.state.get("chain_id") is not None else self.settings.chain_id
            if known_cid is not None:
                reasons = insecure_reasons(self.settings, known_cid)
                if reasons:
                    raise InsecureConfigError(reasons)
            try:
                c = self.get_readonly_client()
                if c is not None:
                    self.check_security_guard(c)
                    cid = self.get_chain_id(c)
                    esc = (
                        (c.escrow.address if hasattr(c, "escrow") and hasattr(c.escrow, "address") else None)
                        or self.settings.escrow_address
                        or find_escrow_address(self.settings.deployments_dir, cid)
                        or "0x0000000000000000000000000000000000000000"
                    )
                    return cid, esc.lower(), c
            except HTTPException:
                raise
            except Exception as exc:
                log.warning("RPC không khả dụng trong active_chain_context: %s", exc)
                if known_cid is None:
                    raise HTTPException(502, "Không kết nối được RPC để xác định mạng Escrow.")
                esc = (
                    self.settings.escrow_address
                    or find_escrow_address(self.settings.deployments_dir, known_cid)
                    or "0x0000000000000000000000000000000000000000"
                )
                return int(known_cid), esc.lower(), None

        cid = self.settings.chain_id if self.settings.chain_id is not None else 31337
        reasons = insecure_reasons(self.settings, cid)
        if reasons:
            raise InsecureConfigError(reasons)
        esc = (
            self.settings.escrow_address
            or find_escrow_address(self.settings.deployments_dir, cid)
            or "0x0000000000000000000000000000000000000000"
        )
        return cid, esc.lower(), None

    def lock_for(self, trade_id: int) -> threading.Lock:
        with self._trade_locks_guard:
            return self._trade_locks.setdefault(trade_id, threading.Lock())

    def get_report(self, trade_id: int) -> Optional[dict]:
        stored = self.db.get_attest_report(trade_id)
        if stored is not None:
            return stored
        f = self.reports_dir / f"{trade_id}.json"
        if f.exists():
            try:
                return json.loads(f.read_text(encoding="utf-8"))
            except Exception:
                return None
        return None

    def load_trade(self, trade_id: int):
        try:
            t = self.require_readonly_client().get_trade(trade_id)
        except ChainError as e:
            raise HTTPException(502, str(e))
        if not t.exists:
            raise HTTPException(404, f"Trade {trade_id} không tồn tại")
        return t

    def is_external_worker_active(self, now: Optional[float] = None) -> tuple[bool, Optional[dict]]:
        meta = self.db.get_agent_runtime_meta()
        if meta is None:
            return False, None
        ts = time.time() if now is None else float(now)
        fresh_window = max(
            float(self.settings.worker_lease_ttl_seconds),
            float(self.settings.agent_poll_seconds) * 4.0,
            30.0,
        )
        hb = meta.get("heartbeat_at")
        active = bool(meta.get("running")) and hb is not None and (ts - hb) <= fresh_window
        return active, meta

    def reconcile_marketplace_readonly(self) -> None:
        cid, esc, active_client = self.active_chain_context(require_client=False)
        self.marketplace.reconcile(client=active_client, chain_id=cid, escrow_address=esc)

    def sync_trade_index_readonly(self) -> None:
        if not is_trade_index_enabled():
            return
        cid, esc, active_client = self.active_chain_context(require_client=False)
        if active_client is not None:
            self.trade_indexer.sync_tick(active_client, cid, esc)

    def _agent_verify(self, trade_id: int, uris: dict[str, str]) -> VerifyResponse:
        try:
            return self.run_verification(VerifyRequest(
                trade_id=trade_id,
                listing_image_url=uris["listing"],
                seller_evidence_url=uris["seller"],
                buyer_evidence_url=uris["buyer"],
            ))
        except InsecureConfigError as exc:
            self.agent.last_error = f"INSECURE_CONFIG: {', '.join(exc.reasons)}"
            raise

    def run_verification(self, req: VerifyRequest) -> VerifyResponse:
        """Verification core shared by the manual endpoint and the autonomous agent (DEC-005 option A)."""
        started = time.time()
        c = self.require_readonly_client() if req.dry_run else self.get_client()
        self.check_security_guard(c)

        # 3. Validate listing_image_url scheme (must be ipfs://)
        if not req.listing_image_url.startswith("ipfs://"):
            raise HTTPException(status_code=422, detail="listing_image_url must be an ipfs:// URI")

        lock = self.lock_for(req.trade_id)
        if not lock.acquire(blocking=False):
            raise HTTPException(409, f"Trade {req.trade_id} đang được xử lý")
        lock_owner = f"{self.agent.worker_id}:{uuid.uuid4().hex}"
        db_lock_acquired = False
        try:
            db_lock_acquired = self.db.acquire_trade_lock(
                req.trade_id, lock_owner, ttl_seconds=self.settings.trade_lock_ttl_seconds
            )
            if not db_lock_acquired:
                raise HTTPException(409, f"Trade {req.trade_id} đang được xử lý")

            # 4. Dữ liệu tin cậy lấy từ chain
            try:
                trade = c.get_trade(req.trade_id)
            except ChainError as e:
                raise HTTPException(502, str(e))
            if not trade.exists:
                raise HTTPException(404, f"Trade {req.trade_id} không tồn tại")
            if trade.state != TradeState.AwaitingEvidence:
                raise HTTPException(409, f"Trade ở trạng thái {trade.state.name}, cần AwaitingEvidence")
            empty = "0x" + "00" * 32
            if trade.seller_evidence_hash == empty or trade.buyer_evidence_hash == empty:
                raise HTTPException(409, "Chưa đủ bằng chứng on-chain từ cả 2 bên")

            # Ràng buộc ảnh niêm yết với chữ ký seller trong sổ URI (SEC-01)
            registered_listing = self.registry.get(req.trade_id).get("listing")
            if not registered_listing:
                raise HTTPException(409, "Chưa có ảnh niêm yết đã ký trong sổ URI, cần seller ký xác nhận")
            if req.listing_image_url != registered_listing:
                raise HTTPException(422, "listing_image_url không khớp ảnh niêm yết seller đã ký")

            # 5. Bằng chứng phải đúng cái đã neo on-chain
            if self.settings.enforce_evidence_hash:
                if evidence_hash_of(req.seller_evidence_url) != trade.seller_evidence_hash:
                    raise HTTPException(422, "seller_evidence_url không khớp sellerEvidenceHash on-chain")
                if evidence_hash_of(req.buyer_evidence_url) != trade.buyer_evidence_hash:
                    raise HTTPException(422, "buyer_evidence_url không khớp buyerEvidenceHash on-chain")

            seller_rep = c.reputation_of(trade.seller)
            buyer_rep = c.reputation_of(trade.buyer)

            # 6. Tải và phân tích
            with tempfile.TemporaryDirectory(prefix=f"trade{req.trade_id}_") as wd:
                try:
                    listing = download(req.listing_image_url, self.settings, wd, "listing")
                    seller = download(req.seller_evidence_url, self.settings, wd, "seller")
                    buyer = download(req.buyer_evidence_url, self.settings, wd, "buyer")
                except DownloadError as e:
                    raise HTTPException(422, str(e))

                # Compute keccak256 hash of listing image
                with open(listing, "rb") as lf:
                    listing_bytes = lf.read()
                listing_hash = Web3.to_hex(Web3.keccak(listing_bytes)).lower()

                known, _ = self.store.hashes_excluding(req.trade_id)
                try:
                    result = ec.analyze_evidence(
                        req.trade_id, listing, seller, buyer, trade.nonce,
                        seller_rep, buyer_rep, trade.item_value,
                        known_hashes=known, with_visual=req.include_visual,
                    )
                except ValueError as e:  # ảnh/video hỏng
                    raise HTTPException(422, f"Bằng chứng không đọc được: {e}")
                except RuntimeError as e:  # thiếu Tesseract...
                    log.exception("pipeline error")
                    raise HTTPException(500, f"Lỗi pipeline: {e}")

            report = result.report
            report_hash = "0x" + result.report_hash.hex()
            log.info("trade %s: risk=%s flagged=%s notes=%s", req.trade_id, report.risk_score, report.flagged, report.notes)

            # 7. Gửi attest()
            tx_hash = None
            if not req.dry_run:
                try:
                    tx_hash = c.send_attest(req.trade_id, report.risk_score, report.flagged, result.report_hash)
                except ChainError as e:
                    log.error("attest failed for trade %s: %s", req.trade_id, e)
                    raise HTTPException(502, str(e))
                self.store.add(req.trade_id, "seller", result.seller_phash)
                self.store.add(req.trade_id, "buyer", result.buyer_phash)

            report_dict = report.to_dict()
            report_dict["listing_hash"] = listing_hash

            resp = VerifyResponse(
                trade_id=req.trade_id,
                report=report_dict,
                report_hash=report_hash,
                report_json=report.canonical_json(),
                attested=tx_hash is not None,
                tx_hash=tx_hash,
                match_visual_png_b64=result.match_visual_b64() if req.include_visual else None,
                duration_ms=int((time.time() - started) * 1000),
            )

            # 8. Lưu report vào SQLite WAL dùng chung (chỉ khi đã attest — bản neo on-chain)
            if tx_hash:
                payload = {
                    **resp.model_dump(),
                    "listing_hash": listing_hash,
                    "evidence": {
                        "listing_image_url": req.listing_image_url,
                        "seller_evidence_url": req.seller_evidence_url,
                        "buyer_evidence_url": req.buyer_evidence_url,
                    },
                }
                self.db.save_attest_report(req.trade_id, report_hash, payload)
            return resp
        finally:
            if db_lock_acquired:
                try:
                    self.db.release_trade_lock(req.trade_id, lock_owner)
                except Exception:
                    pass
            lock.release()

    def has_signing_key(self) -> bool:
        return bool(
            self.state.get("client") is not None
            or (self.settings.agent_private_key and self.settings.agent_private_key.strip())
        )

    def _enforce_verify_cooldown(self, actor_wallet: str, trade_id: int) -> None:
        cooldown = max(0, int(self.settings.verify_trade_cooldown_seconds))
        if cooldown <= 0:
            return
        now = time.time()
        key = (actor_wallet.strip().lower(), int(trade_id))
        with self._verify_cooldowns_guard:
            # Dọn key hết hạn để tránh rò rỉ bộ nhớ dài hạn
            if len(self._verify_cooldowns) > 1024:
                expired = [k for k, ts in self._verify_cooldowns.items() if (now - ts) >= cooldown]
                for k in expired:
                    self._verify_cooldowns.pop(k, None)
            prev = self._verify_cooldowns.get(key)
            if prev is not None and (now - prev) < cooldown:
                raise MarketplaceError(
                    429,
                    "VERIFY_COOLDOWN",
                    f"Vui lòng đợi {cooldown}s giữa các lần kích hoạt AI Verify cho trade {trade_id}.",
                )
            self._verify_cooldowns[key] = now

    def validate_verify_preconditions(
        self,
        req: VerifyRequest,
        *,
        actor_wallet: Optional[str] = None,
    ) -> object:
        """Kiểm tra điều kiện on-chain, sổ URI, hash và quyền tham gia trade (DEC-025) bằng read-only client."""
        c = self.require_readonly_client()
        self.check_security_guard(c)

        if not req.listing_image_url.startswith("ipfs://"):
            raise HTTPException(status_code=422, detail="listing_image_url must be an ipfs:// URI")

        try:
            trade = c.get_trade(req.trade_id)
        except ChainError as e:
            raise HTTPException(502, str(e))
        if not trade.exists:
            raise HTTPException(404, f"Trade {req.trade_id} không tồn tại")

        if actor_wallet is not None:
            actor_norm = actor_wallet.strip().lower()
            if actor_norm not in (str(trade.seller).lower(), str(trade.buyer).lower()):
                raise MarketplaceError(
                    403,
                    "NOT_TRADE_PARTY",
                    "Chỉ người bán hoặc người mua của giao dịch này mới được kích hoạt Verify.",
                )

        if trade.state != TradeState.AwaitingEvidence:
            raise HTTPException(409, f"Trade ở trạng thái {trade.state.name}, cần AwaitingEvidence")
        empty = "0x" + "00" * 32
        if trade.seller_evidence_hash == empty or trade.buyer_evidence_hash == empty:
            raise HTTPException(409, "Chưa đủ bằng chứng on-chain từ cả 2 bên")

        registered_listing = self.registry.get(req.trade_id).get("listing")
        if not registered_listing:
            raise HTTPException(409, "Chưa có ảnh niêm yết đã ký trong sổ URI, cần seller ký xác nhận")
        if req.listing_image_url != registered_listing:
            raise HTTPException(422, "listing_image_url không khớp ảnh niêm yết seller đã ký")

        if self.settings.enforce_evidence_hash:
            if evidence_hash_of(req.seller_evidence_url) != trade.seller_evidence_hash:
                raise HTTPException(422, "seller_evidence_url không khớp sellerEvidenceHash on-chain")
            if evidence_hash_of(req.buyer_evidence_url) != trade.buyer_evidence_hash:
                raise HTTPException(422, "buyer_evidence_url không khớp buyerEvidenceHash on-chain")
        return trade

    def process_pending_verify_jobs(self) -> int:
        """Worker lấy và xử lý tuần tự các manual verify job từ SQLite WAL."""
        processed = 0
        while True:
            job = self.db.claim_next_verify_job(stale_processing_seconds=self.settings.trade_lock_ttl_seconds)
            if job is None:
                break
            tid = int(job["trade_id"])
            try:
                vreq = VerifyRequest(
                    trade_id=tid,
                    listing_image_url=job["listing_image_url"],
                    seller_evidence_url=job["seller_evidence_url"],
                    buyer_evidence_url=job["buyer_evidence_url"],
                    dry_run=False,
                    include_visual=bool(job["include_visual"]),
                )
                resp = self.run_verification(vreq)
                self.db.complete_verify_job(
                    tid,
                    succeeded=True,
                    response_payload=resp.model_dump(),
                )
            except HTTPException as exc:
                self.db.complete_verify_job(
                    tid,
                    succeeded=False,
                    error_status=exc.status_code,
                    error_detail=str(exc.detail),
                )
            except Exception as exc:
                self.db.complete_verify_job(
                    tid,
                    succeeded=False,
                    error_status=500,
                    error_detail=str(exc),
                )
            processed += 1
        return processed

    def delegate_verification(self, req: VerifyRequest, *, requested_by: str) -> VerifyResponse:
        """Ủy thác Verify (dry_run=False) sang Worker cô lập AGENT_PRIVATE_KEY qua SQLite WAL."""
        status = self.db.enqueue_verify_job(
            req.trade_id,
            requested_by,
            req.listing_image_url,
            req.seller_evidence_url,
            req.buyer_evidence_url,
            include_visual=req.include_visual,
            cooldown_seconds=float(self.settings.verify_trade_cooldown_seconds),
            processing_ttl_seconds=float(self.settings.trade_lock_ttl_seconds),
        )
        if status == "busy":
            raise HTTPException(409, f"Trade {req.trade_id} đang được xử lý")
        if status == "cooldown":
            raise MarketplaceError(
                429,
                "VERIFY_COOLDOWN",
                f"Vui lòng đợi trước khi kích hoạt lại Verify cho trade {req.trade_id}.",
            )
        if status == "already_done":
            existing = self.db.get_verify_job(req.trade_id)
            if existing and existing.get("response"):
                return VerifyResponse(**existing["response"])

        deadline = time.monotonic() + max(1.0, float(self.settings.verify_job_wait_timeout_seconds))
        interval = max(0.05, float(self.settings.verify_job_poll_interval_seconds))
        while time.monotonic() < deadline:
            job = self.db.get_verify_job(req.trade_id)
            if job is not None:
                if job["status"] == "SUCCEEDED" and job["response"] is not None:
                    return VerifyResponse(**job["response"])
                if job["status"] == "FAILED":
                    err_status = int(job["error_status"] or 502)
                    raise HTTPException(err_status, job["error_detail"] or "Worker verify thất bại")
            time.sleep(interval)
        raise HTTPException(504, f"Hết thời gian chờ Worker xử lý Verify cho trade {req.trade_id}")

    def verify_or_delegate(
        self,
        req: VerifyRequest,
        *,
        actor_wallet: Optional[str] = None,
    ) -> VerifyResponse:
        if actor_wallet is not None or (not req.dry_run and not self.has_signing_key()):
            self.validate_verify_preconditions(req, actor_wallet=actor_wallet)

        if actor_wallet is not None and not req.dry_run:
            self._enforce_verify_cooldown(actor_wallet, req.trade_id)

        if req.dry_run or self.has_signing_key():
            return self.run_verification(req)

        worker_active, _ = self.is_external_worker_active()
        if not worker_active:
            # Giữ nguyên fail-closed 503 AGENT_PRIVATE_KEY khi cả API và Worker đều không sẵn sàng.
            return self.run_verification(req)

        return self.delegate_verification(req, requested_by=(actor_wallet or "internal_api"))


# ---------------------------------------------------------------------------
# App factory
# ---------------------------------------------------------------------------

def create_app(settings: Optional[Settings] = None, client: Optional[EscrowClient] = None) -> FastAPI:
    settings = settings or Settings.from_env()
    runtime = BackendRuntime(settings=settings, client=client)

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        if settings.agent_auto:
            runtime.agent.start()
        yield
        runtime.agent.stop()

    app = FastAPI(title="Escrow AI Attest Service", version="1.1.0", lifespan=lifespan)
    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    store = runtime.store
    registry = runtime.registry
    db = runtime.db
    marketplace = runtime.marketplace
    agent = runtime.agent
    active_chain_context = runtime.active_chain_context
    get_chain_id = runtime.get_chain_id
    check_security_guard = runtime.check_security_guard
    run_verification = runtime.run_verification
    load_trade = runtime.load_trade

    app.state.runtime = runtime
    app.state.agent = agent
    app.state.registry = registry
    app.state.store = store
    app.state.db = db
    app.state.marketplace = marketplace

    @app.exception_handler(InsecureConfigError)
    def insecure_config_handler(request: Request, exc: InsecureConfigError):
        return JSONResponse(
            status_code=503,
            content={
                "error_code": "INSECURE_CONFIG",
                "detail": f"INSECURE_CONFIG: {', '.join(exc.reasons)}",
                "reasons": exc.reasons,
            },
        )

    @app.exception_handler(MarketplaceError)
    def marketplace_error_handler(request: Request, exc: MarketplaceError):
        body = {
            "error_code": exc.error_code,
            "detail": exc.message,
            "message": exc.message,
        }
        if exc.details is not None:
            body["details"] = exc.details
        return JSONResponse(status_code=exc.status_code, content=body)

    @app.exception_handler(OpsAuthError)
    def ops_auth_error_handler(request: Request, exc: OpsAuthError):
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error_code": exc.error_code,
                "detail": exc.message,
                "message": exc.message,
            },
        )

    @app.exception_handler(PinataRelayError)
    def pinata_relay_error_handler(request: Request, exc: PinataRelayError):
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error_code": exc.error_code,
                "detail": exc.message,
                "message": exc.message,
            },
        )

    rate_limit_lock = threading.Lock()
    rate_limit_records: dict[str, list[float]] = {}
    RATE_LIMIT_WINDOW = 60.0
    RATE_LIMIT_MAX_REQUESTS = 10

    @app.get("/health")
    def health():
        info: dict = {"ok": True, "embedding_backend": ec.embedding_backend(), "known_hashes": len(store)}
        try:
            ec.pytesseract.get_tesseract_version()
            info["tesseract"] = True
        except Exception:
            info["tesseract"] = False
        cid = None
        reasons: list[str] = []
        signer_configured = bool(runtime.state["client"] is not None or settings.agent_private_key)
        try:
            c = runtime.get_client() if signer_configured else runtime.require_readonly_client()
            cid = get_chain_id(c)
            reasons = insecure_reasons(settings, cid)
            info["chain_id"] = cid
            if hasattr(c, "escrow") and hasattr(c.escrow, "address"):
                info["escrow"] = c.escrow.address
            if signer_configured:
                if hasattr(c, "agent_address") and c.agent_address:
                    info["agent"] = c.agent_address
                if hasattr(c, "agent_balance") and callable(c.agent_balance):
                    info["agent_balance_wei"] = str(c.agent_balance())
                if hasattr(c, "onchain_agent") and callable(c.onchain_agent) and hasattr(c, "agent_address"):
                    info["agent_matches_contract"] = c.onchain_agent().lower() == c.agent_address.lower()
        except HTTPException as e:
            info.update({"ok": False, "error": e.detail})
        except Exception as e:
            info.update({"ok": False, "error": f"RPC error: {e}"})

        gw_host = extract_gateway_host(settings.ipfs_gateway)
        ops_jwt_ok = False
        try:
            validate_ops_jwt_secret(settings.ops_jwt_secret, settings.attest_api_key)
            ops_jwt_ok = True
        except OpsAuthConfigError:
            ops_jwt_ok = False
        info["security_toggles"] = {
            "api_key_set": bool(settings.attest_api_key and settings.attest_api_key.strip()),
            "allow_local_hosts": bool(settings.allow_local_hosts),
            "enforce_evidence_hash": bool(settings.enforce_evidence_hash),
            "ipfs_gateway_host": gw_host,
            "insecure_for_chain": bool(cid is not None and len(reasons) > 0),
        }

        meta_active, meta = runtime.is_external_worker_active()
        if "agent" not in info and meta and meta.get("agent_address"):
            info["agent"] = meta["agent_address"]
            if meta.get("agent_balance_wei") is not None:
                info["agent_balance_wei"] = meta["agent_balance_wei"]
            if meta.get("agent_matches_contract") is not None:
                info["agent_matches_contract"] = meta["agent_matches_contract"]

        agent_err = agent.last_error or (meta["last_error"] if meta else None)
        if reasons and not agent_err:
            agent_err = f"INSECURE_CONFIG: {', '.join(reasons)}"

        effective_last_tick = agent.last_tick if agent.last_tick is not None else (meta["last_tick"] if meta else None)
        external_worker_active = bool(meta_active and (meta is None or meta.get("worker_id") != agent.worker_id))

        info.update({
            "agent_auto": settings.agent_auto,
            "agent_running": bool(agent.running or meta_active),
            "agent_last_tick": effective_last_tick,
            "agent_error": agent_err,
            "agent_signer_configured": signer_configured,
            "agent_worker_active": external_worker_active,
            "ops_auth_enabled": bool(settings.enable_shared_auth),
            "ops_jwt_configured": ops_jwt_ok,
            "pinata_relay_configured": bool(settings.pinata_jwt and settings.pinata_jwt.strip()),
        })
        return info

    @app.get("/trade/{trade_id}")
    def get_trade(trade_id: int):
        c = runtime.require_readonly_client()
        try:
            t = c.get_trade(trade_id)
        except ChainError as e:
            raise HTTPException(502, str(e))
        if not t.exists:
            raise HTTPException(404, f"Trade {trade_id} không tồn tại")
        return {**t.to_json(), "nonce_short": ec.short_nonce(t.nonce),
                "seller_reputation": c.reputation_of(t.seller), "buyer_reputation": c.reputation_of(t.buyer)}

    @app.get("/trade/{trade_id}/nonce-qr.png")
    def nonce_qr(trade_id: int, size: int = 480):
        """Mã QR chứa nonce của giao dịch: đặt cạnh món hàng khi chụp thay cho viết tay.
        Sinh bằng cùng thư viện với bộ đọc trong ai-pipeline → chắc chắn đọc lại được."""
        try:
            t = runtime.require_readonly_client().get_trade(trade_id)
        except ChainError as e:
            raise HTTPException(502, str(e))
        if not t.exists:
            raise HTTPException(404, f"Trade {trade_id} không tồn tại")
        img = ec.make_nonce_qr(t.nonce, max(160, min(int(size), 1024)))
        ok, buf = ec.cv2.imencode(".png", img)
        if not ok:
            raise HTTPException(500, "Không tạo được mã QR")
        # nonce bất biến theo trade id → cho trình duyệt cache
        return Response(content=buf.tobytes(), media_type="image/png",
                        headers={"Cache-Control": "public, max-age=3600"})

    @app.get("/report/{trade_id}")
    def get_report(trade_id: int):
        payload = runtime.get_report(trade_id)
        if payload is None:
            raise HTTPException(404, f"Chưa có report cho trade {trade_id}")
        return payload

    def check_api_key(x_api_key: Optional[str]) -> None:
        if settings.attest_api_key:
            if not x_api_key or not hmac.compare_digest(x_api_key.encode("utf-8"), settings.attest_api_key.encode("utf-8")):
                raise HTTPException(status_code=401, detail="Invalid or missing API key")
        else:
            log.warning("ATTEST_API_KEY không được thiết lập - bỏ qua xác thực (chế độ dev)")

    def _consume_rate_limit(key: str, limit: int, *, marketplace: bool = False) -> None:
        now = time.time()
        with rate_limit_lock:
            timestamps = rate_limit_records.get(key, [])
            timestamps = [t for t in timestamps if now - t < RATE_LIMIT_WINDOW]
            if len(timestamps) >= limit:
                rate_limit_records[key] = timestamps
                msg = f"Too Many Requests: Rate limit exceeded ({limit} req/min)"
                if marketplace:
                    raise MarketplaceError(429, "RATE_LIMIT_EXCEEDED", msg)
                raise HTTPException(status_code=429, detail=msg)
            timestamps.append(now)
            rate_limit_records[key] = timestamps

    def check_rate_limit(request: Request, bucket: str = "verify", limit: int = RATE_LIMIT_MAX_REQUESTS) -> None:
        """In-memory rate limiter per (bucket, IP); each endpoint group has its own quota."""
        client_ip = resolve_client_ip(request)
        key = client_ip if bucket == "verify" else f"{bucket}:{client_ip}"
        _consume_rate_limit(key, limit, marketplace=False)

    def resolve_client_ip(request: Request, x_api_key: Optional[str] = None) -> str:
        trusted_proxy = bool(
            settings.trust_proxy_forwarded_for
            or (settings.attest_api_key and x_api_key and hmac.compare_digest(x_api_key.encode("utf-8"), settings.attest_api_key.encode("utf-8")))
        )
        if trusted_proxy:
            fwd = (request.headers.get("X-Forwarded-For") or "").split(",")[0].strip()
            if fwd:
                return fwd
        return request.client.host if request.client and request.client.host else "127.0.0.1"

    def _extract_bearer_token(authorization: Optional[str]) -> Optional[str]:
        if authorization is None or not authorization.strip():
            return None
        parts = authorization.strip().split(None, 1)
        if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
            raise OpsAuthError(401, "INVALID_AUTH_HEADER", "Header Authorization phải theo định dạng 'Bearer <token>'.")
        return parts[1].strip()

    def _extract_verified_read_wallet(
        authorization: Optional[str],
        x_api_key: Optional[str],
        x_authenticated_wallet: Optional[str],
    ) -> Optional[str]:
        """Chỉ dùng wallet để tách bucket rate-limit khi danh tính đã được xác thực mật mã (JWT hoặc BFF API Key)."""
        if authorization and authorization.strip():
            try:
                token = _extract_bearer_token(authorization)
                if token and settings.ops_jwt_secret:
                    secret = validate_ops_jwt_secret(settings.ops_jwt_secret, settings.attest_api_key)
                    claims = decode_hs256_jwt(token, secret, expected_typ=TOKEN_TYP_SESSION)
                    sub = str(claims.get("sub") or "")
                    if re.match(r"^0x[0-9a-fA-F]{40}$", sub):
                        return sub.lower()
            except OpsAuthError:
                return None
        if (
            x_authenticated_wallet
            and settings.attest_api_key
            and x_api_key
            and hmac.compare_digest(x_api_key.encode("utf-8"), settings.attest_api_key.encode("utf-8"))
        ):
            try:
                return normalize_wallet(x_authenticated_wallet, "X-Authenticated-Wallet")
            except MarketplaceError:
                return None
        return None

    def resolve_read_rate_key(
        request: Request,
        x_api_key: Optional[str],
        x_authenticated_wallet: Optional[str],
        authorization: Optional[str] = None,
    ) -> str:
        """Khóa rate-limit theo ví đã xác thực (NAT-friendly) hoặc IP thật qua proxy tin cậy."""
        verified_wallet = _extract_verified_read_wallet(authorization, x_api_key, x_authenticated_wallet)
        if verified_wallet:
            return f"mkt_read:wallet:{verified_wallet}"
        return f"mkt_read:ip:{resolve_client_ip(request, x_api_key)}"

    def authenticate_marketplace_actor(
        request: Request,
        chain_id: int,
        x_api_key: Optional[str],
        x_authenticated_wallet: Optional[str],
        x_authenticated_chain_id: Optional[str],
        x_auth_timestamp: Optional[str],
        x_auth_nonce: Optional[str],
        x_auth_signature: Optional[str],
        bucket: str = "mkt_write",
        limit: int = 60,
        authorization: Optional[str] = None,
    ) -> str:
        """Xác thực qua Ops JWT (Bearer) hoặc kênh BFF HMAC nội bộ; chống spoof header & replay."""
        bearer = _extract_bearer_token(authorization)
        if bearer is not None:
            secret = validate_ops_jwt_secret(settings.ops_jwt_secret, settings.attest_api_key)
            session = verify_ops_session_jwt(bearer, secret=secret, expected_chain_id=chain_id)
            if settings.ops_auth_allowed_origins:
                resolve_request_auth_domain(
                    session.domain,
                    None,
                    None,
                    None,
                    allowed_origins=settings.ops_auth_allowed_origins,
                )
            if x_authenticated_wallet is not None and x_authenticated_wallet.strip():
                hdr_wallet = normalize_wallet(x_authenticated_wallet, "X-Authenticated-Wallet")
                if hdr_wallet != session.address:
                    raise MarketplaceError(401, "WALLET_MISMATCH", "X-Authenticated-Wallet không khớp với Ops JWT.")
            if x_authenticated_chain_id is not None and x_authenticated_chain_id.strip():
                try:
                    hdr_chain = int(x_authenticated_chain_id.strip())
                except ValueError:
                    raise MarketplaceError(422, "INVALID_CHAIN_ID", "X-Authenticated-Chain-Id không hợp lệ.")
                if hdr_chain != session.chain_id:
                    raise MarketplaceError(409, "CHAIN_MISMATCH", "Mạng ví không khớp với phiên Ops JWT.")
            _consume_rate_limit(f"{bucket}:wallet:{session.address}", limit, marketplace=True)
            return session.address

        if settings.enable_shared_auth:
            if (
                not settings.attest_api_key
                or not x_api_key
                or not hmac.compare_digest(x_api_key.encode("utf-8"), settings.attest_api_key.encode("utf-8"))
            ):
                raise MarketplaceError(
                    401,
                    "UNAUTHORIZED",
                    "Yêu cầu đăng nhập (Ops JWT Bearer token hoặc kênh BFF hợp lệ).",
                )

        if settings.attest_api_key:
            if not x_api_key or not hmac.compare_digest(x_api_key.encode("utf-8"), settings.attest_api_key.encode("utf-8")):
                raise MarketplaceError(401, "UNAUTHORIZED", "Invalid or missing Ops JWT or API key.")

        if not x_authenticated_wallet:
            raise MarketplaceError(401, "MISSING_AUTHENTICATED_WALLET", "Yêu cầu xác thực ví qua Ops JWT hoặc kênh BFF tin cậy.")
        actor = normalize_wallet(x_authenticated_wallet, "X-Authenticated-Wallet")

        if x_authenticated_chain_id is not None and x_authenticated_chain_id.strip():
            try:
                hdr_chain = int(x_authenticated_chain_id.strip())
            except ValueError:
                raise MarketplaceError(422, "INVALID_CHAIN_ID", "X-Authenticated-Chain-Id không hợp lệ.")
            if hdr_chain != chain_id:
                raise MarketplaceError(409, "CHAIN_MISMATCH", "Mạng ví không khớp với mạng đang phục vụ.")

        has_sig_headers = any(v is not None for v in (x_auth_timestamp, x_auth_nonce, x_auth_signature))
        if settings.require_proxy_signature or chain_id != 31337 or has_sig_headers or settings.enable_shared_auth:
            if not settings.attest_api_key or not settings.attest_api_key.strip():
                raise InsecureConfigError(["ATTEST_API_KEY is empty for signed proxy verification"])
            if not x_auth_timestamp or not x_auth_nonce or not x_auth_signature:
                raise MarketplaceError(401, "MISSING_PROXY_SIGNATURE", "Thiếu thông tin chữ ký chống replay từ proxy.")
            try:
                ts = int(x_auth_timestamp.strip())
            except ValueError:
                raise MarketplaceError(401, "INVALID_PROXY_TIMESTAMP", "X-Auth-Timestamp không hợp lệ.")

            now = marketplace.clock()
            if abs(now - ts) > settings.proxy_sig_ttl_seconds:
                raise MarketplaceError(401, "EXPIRED_PROXY_REQUEST", "Chữ ký yêu cầu từ proxy đã quá hạn.")

            nonce = x_auth_nonce.strip()
            if not re.match(r"^[A-Za-z0-9._-]{8,128}$", nonce):
                raise MarketplaceError(401, "INVALID_PROXY_NONCE", "X-Auth-Nonce không đúng định dạng.")

            expected_sig = compute_proxy_signature(
                settings.attest_api_key,
                request.method,
                request.url.path,
                actor,
                chain_id,
                ts,
                nonce,
            )
            if not hmac.compare_digest(expected_sig.encode("utf-8"), x_auth_signature.strip().lower().encode("utf-8")):
                raise MarketplaceError(401, "INVALID_PROXY_SIGNATURE", "Chữ ký kênh BFF không hợp lệ.")

            if not db.record_proxy_nonce(nonce, actor, ts + settings.proxy_sig_ttl_seconds, now):
                raise MarketplaceError(401, "REPLAY_DETECTED", "Yêu cầu bị từ chối do trùng nonce (replay).")

        _consume_rate_limit(f"{bucket}:wallet:{actor}", limit, marketplace=True)
        return actor

    def _resolve_verify_or_uri_actor(
        request: Request,
        chain_id: int,
        authorization: Optional[str],
        x_api_key: Optional[str],
        x_authenticated_wallet: Optional[str],
        x_authenticated_chain_id: Optional[str],
        x_auth_timestamp: Optional[str],
        x_auth_nonce: Optional[str],
        x_auth_signature: Optional[str],
        *,
        bucket: str,
        limit: int,
    ) -> Optional[str]:
        has_bearer = bool(authorization and authorization.strip())
        has_wallet_hdr = bool(x_authenticated_wallet and x_authenticated_wallet.strip())
        has_sig_headers = any(v is not None for v in (x_auth_timestamp, x_auth_nonce, x_auth_signature))
        if has_bearer or has_wallet_hdr or has_sig_headers:
            if has_wallet_hdr and not has_bearer and not has_sig_headers and not (
                settings.attest_api_key
                and x_api_key
                and hmac.compare_digest(x_api_key.encode("utf-8"), settings.attest_api_key.encode("utf-8"))
            ):
                raise HTTPException(status_code=401, detail="Invalid or missing authentication credentials")
            return authenticate_marketplace_actor(
                request,
                chain_id,
                x_api_key,
                x_authenticated_wallet,
                x_authenticated_chain_id,
                x_auth_timestamp,
                x_auth_nonce,
                x_auth_signature,
                bucket=bucket,
                limit=limit,
                authorization=authorization,
            )

        if settings.enable_shared_auth:
            if not settings.attest_api_key or not x_api_key or not hmac.compare_digest(
                x_api_key.encode("utf-8"), settings.attest_api_key.encode("utf-8")
            ):
                raise HTTPException(status_code=401, detail="Ops JWT Bearer token hoặc ATTEST_API_KEY hợp lệ là bắt buộc")
        check_api_key(x_api_key)
        check_rate_limit(request, bucket, limit)
        return None

    def _parse_if_none_match(header_val: Optional[str]) -> set[str]:
        if not header_val:
            return set()
        tags: set[str] = set()
        for part in header_val.split(","):
            tok = part.strip()
            if not tok:
                continue
            if tok == "*":
                tags.add("*")
                continue
            if tok.startswith(("W/", "w/")):
                tok = tok[2:].strip()
            tags.add(tok)
        return tags

    def _compute_listings_etag(version: int, chain_id: int, escrow: str, query_spec: dict[str, object]) -> str:
        raw = json.dumps(
            {"v": int(version), "c": int(chain_id), "e": escrow.lower(), "q": query_spec},
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
        digest = hashlib.sha256(raw).hexdigest()[:24]
        return f'"v{int(version)}-{digest}"'

    def _parse_multipart_pin_file(content_type: str, body: bytes) -> tuple[bytes, Optional[str]]:
        ct_lower = (content_type or "").strip().lower()
        if not ct_lower.startswith("multipart/form-data"):
            raise PinataRelayError(400, "INVALID_CONTENT_TYPE", "Yêu cầu multipart/form-data chứa trường 'file'.")
        header_bytes = b"Content-Type: " + content_type.encode("latin-1", errors="ignore") + b"\r\nMIME-Version: 1.0\r\n\r\n"
        try:
            msg = email.parser.BytesParser(policy=email.policy.default).parsebytes(header_bytes + body)
        except Exception as exc:
            raise PinataRelayError(400, "INVALID_MULTIPART", "Không đọc được dữ liệu tải lên.") from exc
        if not msg.is_multipart():
            raise PinataRelayError(400, "INVALID_MULTIPART", "Dữ liệu tải lên không phải multipart hợp lệ.")
        for part in msg.iter_parts():
            if part.get_content_disposition() != "form-data":
                continue
            field_name = part.get_param("name", header="content-disposition")
            if field_name == "file":
                data = part.get_payload(decode=True)
                if data is None:
                    raw_payload = part.get_payload()
                    data = raw_payload.encode("latin-1", errors="ignore") if isinstance(raw_payload, str) else b""
                declared = part.get_content_type() if "content-type" in part else None
                return data, declared
        raise PinataRelayError(400, "MISSING_FILE", "Vui lòng chọn tệp để tải lên (thiếu trường 'file').")

    # -----------------------------------------------------------------------
    # Shared Auth (DEC-023): EIP-191 Challenge -> Ops JWT
    # -----------------------------------------------------------------------

    @app.post("/auth/challenge")
    def auth_challenge_endpoint(body: AuthChallengeRequest, request: Request):
        _consume_rate_limit(f"auth_challenge:{resolve_client_ip(request)}", 60, marketplace=True)
        cid, _, _ = active_chain_context(require_client=False)
        secret = validate_ops_jwt_secret(settings.ops_jwt_secret, settings.attest_api_key)
        target_chain = cid if body.chain_id is None else int(body.chain_id)
        if target_chain != cid:
            raise OpsAuthError(409, "CHAIN_MISMATCH", "Mạng yêu cầu không khớp với mạng Backend đang phục vụ.")
        allowed = settings.ops_auth_allowed_origins or None
        domain = resolve_request_auth_domain(
            body.domain,
            request.headers.get("origin"),
            request.headers.get("referer"),
            request.headers.get("host"),
            allowed_origins=allowed,
        )
        return issue_auth_challenge(
            address=body.address,
            chain_id=target_chain,
            domain=domain,
            secret=secret,
            ttl_seconds=settings.ops_auth_challenge_ttl_seconds,
        )

    @app.post("/auth/verify")
    def auth_verify_endpoint(body: AuthVerifyRequest, request: Request):
        _consume_rate_limit(f"auth_verify:{resolve_client_ip(request)}", 30, marketplace=True)
        cid, _, _ = active_chain_context(require_client=False)
        secret = validate_ops_jwt_secret(settings.ops_jwt_secret, settings.attest_api_key)
        target_chain = cid if body.chain_id is None else int(body.chain_id)
        allowed = settings.ops_auth_allowed_origins or None
        domain = resolve_request_auth_domain(
            body.domain,
            request.headers.get("origin"),
            request.headers.get("referer"),
            request.headers.get("host"),
            allowed_origins=allowed,
        )
        return verify_challenge_and_issue_jwt(
            db=db,
            address=body.address,
            chain_id=target_chain,
            nonce=body.nonce,
            signature=body.signature,
            challenge_token=body.challenge_token,
            domain=domain,
            secret=secret,
            active_chain_id=cid,
            session_ttl_seconds=settings.ops_auth_session_ttl_seconds,
        )

    @app.get("/auth/session")
    def auth_session_endpoint(
        authorization: Optional[str] = Header(None, alias="Authorization"),
    ):
        cid, _, _ = active_chain_context(require_client=False)
        bearer = _extract_bearer_token(authorization)
        if bearer is None:
            return {"authenticated": False, "address": None, "chain_id": cid}
        secret = validate_ops_jwt_secret(settings.ops_jwt_secret, settings.attest_api_key)
        session = verify_ops_session_jwt(bearer, secret=secret, expected_chain_id=cid)
        return {
            "authenticated": True,
            "address": Web3.to_checksum_address(session.address),
            "chain_id": session.chain_id,
            "domain": session.domain,
            "expires_at": session.expires_at,
        }

    # -----------------------------------------------------------------------
    # Pinata Upload Relay (DEC-024): giữ PINATA_JWT hoàn toàn phía Ops Backend
    # -----------------------------------------------------------------------

    @app.post("/pin")
    async def pin_upload_endpoint(
        request: Request,
        authorization: Optional[str] = Header(None, alias="Authorization"),
        x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
        x_authenticated_wallet: Optional[str] = Header(None, alias="X-Authenticated-Wallet"),
        x_authenticated_chain_id: Optional[str] = Header(None, alias="X-Authenticated-Chain-Id"),
        x_auth_timestamp: Optional[str] = Header(None, alias="X-Auth-Timestamp"),
        x_auth_nonce: Optional[str] = Header(None, alias="X-Auth-Nonce"),
        x_auth_signature: Optional[str] = Header(None, alias="X-Auth-Signature"),
    ):
        cid, _, _ = active_chain_context(require_client=False)
        actor = authenticate_marketplace_actor(
            request,
            cid,
            x_api_key,
            x_authenticated_wallet,
            x_authenticated_chain_id,
            x_auth_timestamp,
            x_auth_nonce,
            x_auth_signature,
            bucket="pin_relay",
            limit=60,
            authorization=authorization,
        )
        max_body_bytes = MAX_VIDEO_BYTES + 262_144
        cl_raw = request.headers.get("content-length")
        if cl_raw:
            try:
                if int(cl_raw) > max_body_bytes:
                    raise PinataRelayError(
                        413,
                        "FILE_TOO_LARGE",
                        "File vượt quá giới hạn (ảnh tối đa 10 MB, video MP4 tối đa 50 MB).",
                    )
            except ValueError:
                pass

        chunks: list[bytes] = []
        total = 0
        async for chunk in request.stream():
            total += len(chunk)
            if total > max_body_bytes:
                raise PinataRelayError(
                    413,
                    "FILE_TOO_LARGE",
                    "File vượt quá giới hạn (ảnh tối đa 10 MB, video MP4 tối đa 50 MB).",
                )
            chunks.append(chunk)
        raw_body = b"".join(chunks)
        file_bytes, declared_mime = _parse_multipart_pin_file(request.headers.get("content-type") or "", raw_body)
        client_ip = resolve_client_ip(request, x_api_key)
        return await run_in_threadpool(
            handle_pin_upload,
            db=db,
            wallet=actor,
            client_ip=client_ip,
            chain_id=cid,
            data=file_bytes,
            declared_mime=declared_mime,
            pinata_jwt=settings.pinata_jwt,
            pinata_url=settings.pinata_url,
            quota_window_seconds=settings.pin_quota_window_seconds,
            max_wallet_files=settings.pin_max_wallet_files,
            max_wallet_bytes=settings.pin_max_wallet_bytes,
            max_ip_files=settings.pin_max_ip_files,
            max_ip_bytes=settings.pin_max_ip_bytes,
            uploader=runtime.pin_uploader,
        )

    @app.post("/verify-evidence", response_model=VerifyResponse)
    def verify_evidence(
        req: VerifyRequest,
        request: Request,
        authorization: Optional[str] = Header(None, alias="Authorization"),
        x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
        x_authenticated_wallet: Optional[str] = Header(None, alias="X-Authenticated-Wallet"),
        x_authenticated_chain_id: Optional[str] = Header(None, alias="X-Authenticated-Chain-Id"),
        x_auth_timestamp: Optional[str] = Header(None, alias="X-Auth-Timestamp"),
        x_auth_nonce: Optional[str] = Header(None, alias="X-Auth-Nonce"),
        x_auth_signature: Optional[str] = Header(None, alias="X-Auth-Signature"),
    ):
        cid, _, _ = active_chain_context(require_client=False)
        actor_wallet = _resolve_verify_or_uri_actor(
            request,
            cid,
            authorization,
            x_api_key,
            x_authenticated_wallet,
            x_authenticated_chain_id,
            x_auth_timestamp,
            x_auth_nonce,
            x_auth_signature,
            bucket="verify",
            limit=RATE_LIMIT_MAX_REQUESTS,
        )
        return runtime.verify_or_delegate(req, actor_wallet=actor_wallet)

    # -----------------------------------------------------------------------
    # Agent tự động: sổ URI + trạng thái
    # -----------------------------------------------------------------------

    @app.post("/trade/{trade_id}/uris")
    def register_uri(
        trade_id: int,
        body: UriRequest,
        request: Request,
        authorization: Optional[str] = Header(None, alias="Authorization"),
        x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
        x_authenticated_wallet: Optional[str] = Header(None, alias="X-Authenticated-Wallet"),
        x_authenticated_chain_id: Optional[str] = Header(None, alias="X-Authenticated-Chain-Id"),
        x_auth_timestamp: Optional[str] = Header(None, alias="X-Auth-Timestamp"),
        x_auth_nonce: Optional[str] = Header(None, alias="X-Auth-Nonce"),
        x_auth_signature: Optional[str] = Header(None, alias="X-Auth-Signature"),
    ):
        """Báo cho agent biết URI thật của ảnh niêm yết / bằng chứng. Không tin client:
        bằng chứng phải khớp hash đã neo on-chain, ảnh niêm yết phải có chữ ký ví seller."""
        c = runtime.require_readonly_client()
        check_security_guard(c)
        cid = get_chain_id(c)
        actor_wallet = _resolve_verify_or_uri_actor(
            request,
            cid,
            authorization,
            x_api_key,
            x_authenticated_wallet,
            x_authenticated_chain_id,
            x_auth_timestamp,
            x_auth_nonce,
            x_auth_signature,
            bucket="uris",
            limit=60,
        )
        if not body.uri.startswith("ipfs://"):
            raise HTTPException(422, "uri must be an ipfs:// URI")
        t = load_trade(trade_id)
        if actor_wallet is not None:
            actor_norm = actor_wallet.lower()
            if actor_norm not in (t.seller.lower(), t.buyer.lower()):
                raise MarketplaceError(403, "NOT_TRADE_PARTY", "Chỉ seller hoặc buyer của giao dịch mới được đăng ký URI.")
            if body.role == "seller" and actor_norm != t.seller.lower():
                raise MarketplaceError(403, "NOT_TRADE_SELLER", "Chỉ ví seller mới được đăng ký seller URI.")
            if body.role == "buyer" and actor_norm != t.buyer.lower():
                raise MarketplaceError(403, "NOT_TRADE_BUYER", "Chỉ ví buyer mới được đăng ký buyer URI.")
        if body.role == "listing":
            if not body.signature:
                raise HTTPException(422, "Thiếu chữ ký của seller cho ảnh niêm yết")
            msg = listing_message(cid, c.escrow.address, trade_id, body.uri)
            try:
                signer = recover_signer(msg, body.signature)
            except Exception:
                raise HTTPException(422, "Chữ ký không hợp lệ")
            if signer.lower() != t.seller.lower():
                raise HTTPException(403, "Chữ ký không phải của seller giao dịch này")
        else:
            onchain = t.seller_evidence_hash if body.role == "seller" else t.buyer_evidence_hash
            if onchain == "0x" + "00" * 32:
                raise HTTPException(409, f"{body.role} chưa nộp bằng chứng on-chain")
            if evidence_hash_of(body.uri) != onchain:
                raise HTTPException(422, f"uri không khớp {body.role}EvidenceHash on-chain")
        try:
            registry.set(trade_id, body.role, body.uri)
        except UriConflict as e:
            raise HTTPException(409, str(e))
        return {"trade_id": trade_id, "uris": registry.get(trade_id)}

    @app.get("/trade/{trade_id}/uris")
    def get_uris(trade_id: int):
        return {"trade_id": trade_id, "uris": registry.get(trade_id)}

    @app.get("/agent/status/{trade_id}")
    def agent_status(trade_id: int):
        meta_active, _ = runtime.is_external_worker_active()
        return {"enabled": bool(settings.agent_auto or meta_active), **agent.status_for(load_trade(trade_id))}

    # -----------------------------------------------------------------------
    # Marketplace Endpoints (MKT-002: Listings, Purchase Requests, Bind & Sync)
    # -----------------------------------------------------------------------

    @app.get("/listings")
    def get_listings(
        request: Request,
        q: Optional[str] = None,
        category: Optional[str] = None,
        condition: Optional[str] = None,
        status: Optional[str] = "ACTIVE",
        seller: Optional[str] = None,
        min_price_wei: Optional[str] = None,
        max_price_wei: Optional[str] = None,
        in_stock_only: bool = False,
        sort: str = "newest",
        page: int = 1,
        limit: int = 20,
        authorization: Optional[str] = Header(None, alias="Authorization"),
        x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
        x_authenticated_wallet: Optional[str] = Header(None, alias="X-Authenticated-Wallet"),
    ):
        _consume_rate_limit(
            resolve_read_rate_key(request, x_api_key, x_authenticated_wallet, authorization),
            max(60, int(settings.read_rate_limit_per_min)),
            marketplace=True,
        )
        cid, esc, active_client = active_chain_context(require_client=False)
        query_spec = {
            "q": (q or "").strip(),
            "category": (category or "").strip().lower(),
            "condition": (condition or "").strip().lower(),
            "status": (status or "ACTIVE").strip().upper(),
            "seller": (seller or "").strip().lower(),
            "min_price_wei": min_price_wei or "",
            "max_price_wei": max_price_wei or "",
            "in_stock_only": bool(in_stock_only),
            "sort": sort,
            "page": max(1, int(page)),
            "limit": max(1, min(100, int(limit))),
        }
        inm_tags = _parse_if_none_match(request.headers.get("if-none-match"))
        ver_before = marketplace.get_listings_version()
        candidate_etag = _compute_listings_etag(ver_before, cid, esc, query_spec)
        verify_chain = bool(getattr(settings, "verify_chain_before_ttl_release", True))
        needs_ttl_check = False
        if inm_tags and ("*" in inm_tags or candidate_etag in inm_tags):
            has_expired = marketplace.has_expired_unbound_reservations(cid, esc)
            if has_expired and (not verify_chain or active_client is not None):
                needs_ttl_check = True
            else:
                return Response(
                    status_code=304,
                    headers={"ETag": candidate_etag, "Cache-Control": "no-cache", "Vary": "Origin"},
                )

        payload = marketplace.list_listings(
            cid,
            esc,
            q=q,
            category=category,
            condition=condition,
            status=status,
            seller=seller,
            min_price_wei=min_price_wei,
            max_price_wei=max_price_wei,
            in_stock_only=in_stock_only,
            sort=sort,
            page=page,
            limit=limit,
            client=active_client,
        )
        ver_after = marketplace.get_listings_version() if needs_ttl_check else ver_before
        final_etag = _compute_listings_etag(ver_after, cid, esc, query_spec)
        if inm_tags and ("*" in inm_tags or final_etag in inm_tags):
            return Response(
                status_code=304,
                headers={"ETag": final_etag, "Cache-Control": "no-cache", "Vary": "Origin"},
            )
        return JSONResponse(
            status_code=200,
            content=payload,
            headers={"ETag": final_etag, "Cache-Control": "no-cache", "Vary": "Origin"},
        )

    @app.get("/listings/{listing_id}")
    def get_listing_detail(
        listing_id: str,
        request: Request,
        authorization: Optional[str] = Header(None, alias="Authorization"),
        x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
        x_authenticated_wallet: Optional[str] = Header(None, alias="X-Authenticated-Wallet"),
    ):
        _consume_rate_limit(
            resolve_read_rate_key(request, x_api_key, x_authenticated_wallet, authorization),
            max(60, int(settings.read_rate_limit_per_min)),
            marketplace=True,
        )
        cid, esc, active_client = active_chain_context(require_client=False)

        def rep_lookup(wallet: str) -> Optional[int]:
            if active_client is None or not hasattr(active_client, "reputation_of"):
                return None
            try:
                return int(active_client.reputation_of(wallet))
            except Exception:
                return None

        return marketplace.get_listing(cid, esc, listing_id, reputation_lookup=rep_lookup, client=active_client)

    @app.post("/listings", status_code=201)
    def create_listing_endpoint(
        body: CreateListingRequest,
        request: Request,
        authorization: Optional[str] = Header(None, alias="Authorization"),
        x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
        x_authenticated_wallet: Optional[str] = Header(None, alias="X-Authenticated-Wallet"),
        x_authenticated_chain_id: Optional[str] = Header(None, alias="X-Authenticated-Chain-Id"),
        x_auth_timestamp: Optional[str] = Header(None, alias="X-Auth-Timestamp"),
        x_auth_nonce: Optional[str] = Header(None, alias="X-Auth-Nonce"),
        x_auth_signature: Optional[str] = Header(None, alias="X-Auth-Signature"),
        idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
    ):
        started = time.time()
        cid, esc, _ = active_chain_context(require_client=False)
        actor = authenticate_marketplace_actor(
            request, cid, x_api_key, x_authenticated_wallet, x_authenticated_chain_id,
            x_auth_timestamp, x_auth_nonce, x_auth_signature, bucket="mkt_create_listing", limit=30,
            authorization=authorization,
        )
        out = marketplace.create_listing(actor, cid, esc, body, idempotency_key=idempotency_key)
        log.info("marketplace action=create_listing id=%s duration_ms=%s result=ok", out["id"], int((time.time() - started) * 1000))
        return out

    @app.patch("/listings/{listing_id}")
    def update_listing_endpoint(
        listing_id: str,
        body: UpdateListingRequest,
        request: Request,
        authorization: Optional[str] = Header(None, alias="Authorization"),
        x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
        x_authenticated_wallet: Optional[str] = Header(None, alias="X-Authenticated-Wallet"),
        x_authenticated_chain_id: Optional[str] = Header(None, alias="X-Authenticated-Chain-Id"),
        x_auth_timestamp: Optional[str] = Header(None, alias="X-Auth-Timestamp"),
        x_auth_nonce: Optional[str] = Header(None, alias="X-Auth-Nonce"),
        x_auth_signature: Optional[str] = Header(None, alias="X-Auth-Signature"),
    ):
        started = time.time()
        cid, esc, active_client = active_chain_context(require_client=False)
        actor = authenticate_marketplace_actor(
            request, cid, x_api_key, x_authenticated_wallet, x_authenticated_chain_id,
            x_auth_timestamp, x_auth_nonce, x_auth_signature, bucket="mkt_write", limit=60,
            authorization=authorization,
        )
        out = marketplace.update_listing(actor, cid, esc, listing_id, body, client=active_client)
        log.info("marketplace action=update_listing id=%s duration_ms=%s result=ok", listing_id, int((time.time() - started) * 1000))
        return out

    @app.post("/listings/{listing_id}/requests", status_code=201)
    def create_purchase_request_endpoint(
        listing_id: str,
        body: CreatePurchaseRequest,
        request: Request,
        authorization: Optional[str] = Header(None, alias="Authorization"),
        x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
        x_authenticated_wallet: Optional[str] = Header(None, alias="X-Authenticated-Wallet"),
        x_authenticated_chain_id: Optional[str] = Header(None, alias="X-Authenticated-Chain-Id"),
        x_auth_timestamp: Optional[str] = Header(None, alias="X-Auth-Timestamp"),
        x_auth_nonce: Optional[str] = Header(None, alias="X-Auth-Nonce"),
        x_auth_signature: Optional[str] = Header(None, alias="X-Auth-Signature"),
        idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
    ):
        started = time.time()
        cid, esc, active_client = active_chain_context(require_client=False)
        actor = authenticate_marketplace_actor(
            request, cid, x_api_key, x_authenticated_wallet, x_authenticated_chain_id,
            x_auth_timestamp, x_auth_nonce, x_auth_signature, bucket="mkt_request", limit=30,
            authorization=authorization,
        )
        out = marketplace.create_purchase_request(actor, cid, esc, listing_id, body, idempotency_key=idempotency_key, client=active_client)
        log.info("marketplace action=create_request id=%s duration_ms=%s result=ok", out["id"], int((time.time() - started) * 1000))
        return out

    @app.get("/requests")
    def list_requests_endpoint(
        request: Request,
        role: str = "all",
        status: Optional[str] = None,
        page: int = 1,
        limit: int = 20,
        authorization: Optional[str] = Header(None, alias="Authorization"),
        x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
        x_authenticated_wallet: Optional[str] = Header(None, alias="X-Authenticated-Wallet"),
        x_authenticated_chain_id: Optional[str] = Header(None, alias="X-Authenticated-Chain-Id"),
        x_auth_timestamp: Optional[str] = Header(None, alias="X-Auth-Timestamp"),
        x_auth_nonce: Optional[str] = Header(None, alias="X-Auth-Nonce"),
        x_auth_signature: Optional[str] = Header(None, alias="X-Auth-Signature"),
    ):
        cid, esc, active_client = active_chain_context(require_client=False)
        actor = authenticate_marketplace_actor(
            request, cid, x_api_key, x_authenticated_wallet, x_authenticated_chain_id,
            x_auth_timestamp, x_auth_nonce, x_auth_signature, bucket="mkt_read",
            limit=max(60, int(settings.read_rate_limit_per_min)), authorization=authorization,
        )
        return marketplace.list_requests(actor, cid, esc, role=role, status=status, page=page, limit=limit, client=active_client)

    @app.get("/requests/{request_id}")
    def get_request_endpoint(
        request_id: str,
        request: Request,
        authorization: Optional[str] = Header(None, alias="Authorization"),
        x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
        x_authenticated_wallet: Optional[str] = Header(None, alias="X-Authenticated-Wallet"),
        x_authenticated_chain_id: Optional[str] = Header(None, alias="X-Authenticated-Chain-Id"),
        x_auth_timestamp: Optional[str] = Header(None, alias="X-Auth-Timestamp"),
        x_auth_nonce: Optional[str] = Header(None, alias="X-Auth-Nonce"),
        x_auth_signature: Optional[str] = Header(None, alias="X-Auth-Signature"),
    ):
        cid, esc, active_client = active_chain_context(require_client=False)
        actor = authenticate_marketplace_actor(
            request, cid, x_api_key, x_authenticated_wallet, x_authenticated_chain_id,
            x_auth_timestamp, x_auth_nonce, x_auth_signature, bucket="mkt_read",
            limit=max(60, int(settings.read_rate_limit_per_min)), authorization=authorization,
        )
        return marketplace.get_request(actor, cid, esc, request_id, client=active_client)

    @app.post("/requests/{request_id}/decision")
    def decide_request_endpoint(
        request_id: str,
        body: DecisionRequest,
        request: Request,
        authorization: Optional[str] = Header(None, alias="Authorization"),
        x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
        x_authenticated_wallet: Optional[str] = Header(None, alias="X-Authenticated-Wallet"),
        x_authenticated_chain_id: Optional[str] = Header(None, alias="X-Authenticated-Chain-Id"),
        x_auth_timestamp: Optional[str] = Header(None, alias="X-Auth-Timestamp"),
        x_auth_nonce: Optional[str] = Header(None, alias="X-Auth-Nonce"),
        x_auth_signature: Optional[str] = Header(None, alias="X-Auth-Signature"),
        idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
    ):
        started = time.time()
        cid, esc, active_client = active_chain_context(require_client=False)
        actor = authenticate_marketplace_actor(
            request, cid, x_api_key, x_authenticated_wallet, x_authenticated_chain_id,
            x_auth_timestamp, x_auth_nonce, x_auth_signature, bucket="mkt_write", limit=60,
            authorization=authorization,
        )
        out = marketplace.decide_request(actor, cid, esc, request_id, body, idempotency_key=idempotency_key, client=active_client)
        log.info("marketplace action=decide_request id=%s status=%s duration_ms=%s", request_id, out["status"], int((time.time() - started) * 1000))
        return out

    @app.post("/requests/{request_id}/cancel")
    def cancel_request_endpoint(
        request_id: str,
        request: Request,
        body: Optional[CancelRequestBody] = None,
        authorization: Optional[str] = Header(None, alias="Authorization"),
        x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
        x_authenticated_wallet: Optional[str] = Header(None, alias="X-Authenticated-Wallet"),
        x_authenticated_chain_id: Optional[str] = Header(None, alias="X-Authenticated-Chain-Id"),
        x_auth_timestamp: Optional[str] = Header(None, alias="X-Auth-Timestamp"),
        x_auth_nonce: Optional[str] = Header(None, alias="X-Auth-Nonce"),
        x_auth_signature: Optional[str] = Header(None, alias="X-Auth-Signature"),
        idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
    ):
        started = time.time()
        cid, esc, active_client = active_chain_context(require_client=False)
        actor = authenticate_marketplace_actor(
            request, cid, x_api_key, x_authenticated_wallet, x_authenticated_chain_id,
            x_auth_timestamp, x_auth_nonce, x_auth_signature, bucket="mkt_write", limit=60,
            authorization=authorization,
        )
        out = marketplace.cancel_request(actor, cid, esc, request_id, body=body, idempotency_key=idempotency_key, client=active_client)
        log.info("marketplace action=cancel_request id=%s duration_ms=%s result=ok", request_id, int((time.time() - started) * 1000))
        return out

    @app.post("/requests/{request_id}/bind-trade")
    def bind_trade_endpoint(
        request_id: str,
        body: BindTradeRequest,
        request: Request,
        authorization: Optional[str] = Header(None, alias="Authorization"),
        x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
        x_authenticated_wallet: Optional[str] = Header(None, alias="X-Authenticated-Wallet"),
        x_authenticated_chain_id: Optional[str] = Header(None, alias="X-Authenticated-Chain-Id"),
        x_auth_timestamp: Optional[str] = Header(None, alias="X-Auth-Timestamp"),
        x_auth_nonce: Optional[str] = Header(None, alias="X-Auth-Nonce"),
        x_auth_signature: Optional[str] = Header(None, alias="X-Auth-Signature"),
        idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
    ):
        started = time.time()
        cid, esc, active_client = active_chain_context(require_client=True)
        actor = authenticate_marketplace_actor(
            request, cid, x_api_key, x_authenticated_wallet, x_authenticated_chain_id,
            x_auth_timestamp, x_auth_nonce, x_auth_signature, bucket="mkt_write", limit=60,
            authorization=authorization,
        )
        assert active_client is not None
        out = marketplace.bind_trade(actor, cid, esc, request_id, body, active_client, idempotency_key=idempotency_key)
        log.info(
            "marketplace action=bind_trade request_id=%s trade_id=%s recovered=%s duration_ms=%s",
            request_id, out.get("trade_id"), out.get("recovered"), int((time.time() - started) * 1000),
        )
        return out

    @app.post("/trades/{trade_id}/sync")
    def sync_trade_endpoint(
        trade_id: int,
        request: Request,
        authorization: Optional[str] = Header(None, alias="Authorization"),
        x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
        x_authenticated_wallet: Optional[str] = Header(None, alias="X-Authenticated-Wallet"),
        x_authenticated_chain_id: Optional[str] = Header(None, alias="X-Authenticated-Chain-Id"),
        x_auth_timestamp: Optional[str] = Header(None, alias="X-Auth-Timestamp"),
        x_auth_nonce: Optional[str] = Header(None, alias="X-Auth-Nonce"),
        x_auth_signature: Optional[str] = Header(None, alias="X-Auth-Signature"),
    ):
        started = time.time()
        cid, esc, active_client = active_chain_context(require_client=True)
        actor = authenticate_marketplace_actor(
            request, cid, x_api_key, x_authenticated_wallet, x_authenticated_chain_id,
            x_auth_timestamp, x_auth_nonce, x_auth_signature, bucket="mkt_write", limit=60,
            authorization=authorization,
        )
        assert active_client is not None
        out = marketplace.sync_trade(actor, cid, esc, trade_id, active_client)
        log.info(
            "marketplace action=sync_trade trade_id=%s state=%s duration_ms=%s",
            trade_id, out.get("synced_state"), int((time.time() - started) * 1000),
        )
        return out

    @app.get("/trades/{trade_id}/context")
    def get_trade_context_endpoint(
        trade_id: int,
        request: Request,
        authorization: Optional[str] = Header(None, alias="Authorization"),
        x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
        x_authenticated_wallet: Optional[str] = Header(None, alias="X-Authenticated-Wallet"),
    ):
        _consume_rate_limit(
            resolve_read_rate_key(request, x_api_key, x_authenticated_wallet, authorization),
            max(60, int(settings.read_rate_limit_per_min)),
            marketplace=True,
        )
        cid, esc, _ = active_chain_context(require_client=False)
        out = marketplace.get_trade_context(cid, esc, trade_id)
        return out

    @app.get("/trades/index")
    def get_trade_index_endpoint(
        request: Request,
        wallet: Optional[str] = None,
        filter: str = "all",
        offset: int = 0,
        limit: int = 50,
        authorization: Optional[str] = Header(None, alias="Authorization"),
        x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
        x_authenticated_wallet: Optional[str] = Header(None, alias="X-Authenticated-Wallet"),
        x_authenticated_chain_id: Optional[str] = Header(None, alias="X-Authenticated-Chain-Id"),
        x_auth_timestamp: Optional[str] = Header(None, alias="X-Auth-Timestamp"),
        x_auth_nonce: Optional[str] = Header(None, alias="X-Auth-Nonce"),
        x_auth_signature: Optional[str] = Header(None, alias="X-Auth-Signature"),
    ):
        if not is_trade_index_enabled():
            raise MarketplaceError(
                503,
                "TRADE_INDEX_DISABLED",
                "Trade index đang tạm tắt ở cấu hình runtime.",
                details={"fallback": "direct_rpc"},
            )
        cid, esc, _ = active_chain_context(require_client=False)
        authenticate_marketplace_actor(
            request,
            cid,
            x_api_key,
            x_authenticated_wallet,
            x_authenticated_chain_id,
            x_auth_timestamp,
            x_auth_nonce,
            x_auth_signature,
            bucket="mkt_read",
            limit=max(60, int(settings.read_rate_limit_per_min)),
            authorization=authorization,
        )
        clean_filter = (filter or "all").strip().lower()
        if clean_filter not in ("all", "disputed", "flagged", "active"):
            raise MarketplaceError(422, "INVALID_FILTER", "Giá trị filter không hợp lệ.")
        if int(offset) < 0:
            raise MarketplaceError(422, "INVALID_OFFSET", "Giá trị offset không được âm.")
        clean_wallet: Optional[str] = None
        if wallet is not None and wallet.strip():
            clean_wallet = normalize_wallet(wallet, "wallet")
        eff_limit = max(1, min(100, int(limit)))
        payload = db.query_trade_index(
            cid,
            esc,
            wallet=clean_wallet,
            filter_mode=clean_filter,
            offset=int(offset),
            limit=eff_limit,
            max_stale_seconds=runtime.trade_indexer.max_stale_seconds,
            max_block_lag=runtime.trade_indexer.max_block_lag,
        )
        if not payload["deployBlock"]:
            payload["deployBlock"] = runtime.trade_indexer.resolve_deploy_block(cid)
        return payload

    @app.post("/marketplace/reconcile")
    def reconcile_marketplace_endpoint(
        request: Request,
        authorization: Optional[str] = Header(None, alias="Authorization"),
        x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
        x_authenticated_wallet: Optional[str] = Header(None, alias="X-Authenticated-Wallet"),
        x_authenticated_chain_id: Optional[str] = Header(None, alias="X-Authenticated-Chain-Id"),
        x_auth_timestamp: Optional[str] = Header(None, alias="X-Auth-Timestamp"),
        x_auth_nonce: Optional[str] = Header(None, alias="X-Auth-Nonce"),
        x_auth_signature: Optional[str] = Header(None, alias="X-Auth-Signature"),
    ):
        started = time.time()
        cid, esc, active_client = active_chain_context(require_client=False)
        authenticate_marketplace_actor(
            request, cid, x_api_key, x_authenticated_wallet, x_authenticated_chain_id,
            x_auth_timestamp, x_auth_nonce, x_auth_signature, bucket="mkt_reconcile", limit=30,
            authorization=authorization,
        )
        out = marketplace.reconcile(client=active_client, chain_id=cid, escrow_address=esc)
        log.info("marketplace action=reconcile duration_ms=%s result=%s", int((time.time() - started) * 1000), out)
        return out

    return app


logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"),
                    format="%(asctime)s %(levelname)s %(name)s: %(message)s")

app = create_app()
