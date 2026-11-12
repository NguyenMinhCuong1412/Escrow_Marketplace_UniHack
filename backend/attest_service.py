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

import ipaddress
import json
import logging
import os
import socket
import sys
import tempfile
import threading
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal, Optional
from urllib.parse import urlparse, urljoin

import requests
from fastapi import FastAPI, HTTPException, Request, Header, Response
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

    @classmethod
    def from_env(cls) -> "Settings":
        _load_dotenv()
        cors_val = os.environ.get("CORS_ORIGINS", "")
        cors_origins = [o.strip() for o in cors_val.split(",") if o.strip()]
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
    return reasons


def extract_gateway_host(gw: str) -> str:
    if not gw:
        return ""
    if "://" not in gw:
        gw = "http://" + gw
    from urllib.parse import urlsplit
    return urlsplit(gw).hostname or gw


# ---------------------------------------------------------------------------
# Kho pHash đã biết (Vai 1) — lưu file JSON để sống qua restart
# ---------------------------------------------------------------------------

class KnownHashStore:
    def __init__(self, path: Path):
        self.path = path
        self._lock = threading.Lock()
        self._items: list[dict] = []
        if path.exists():
            try:
                self._items = json.loads(path.read_text(encoding="utf-8"))
            except Exception:
                log.warning("known_hashes.json hỏng, bắt đầu kho rỗng")

    def hashes_excluding(self, trade_id: int) -> tuple[list[imagehash.ImageHash], list[dict]]:
        """Bỏ qua hash của chính giao dịch này (verify lại không bị tính là tái sử dụng)."""
        with self._lock:
            rows = [r for r in self._items if r["trade_id"] != trade_id]
        return [imagehash.hex_to_hash(r["phash"]) for r in rows], rows

    def add(self, trade_id: int, role: str, phash: str) -> None:
        with self._lock:
            if any(r["trade_id"] == trade_id and r["role"] == role for r in self._items):
                return
            self._items.append({"trade_id": trade_id, "role": role, "phash": phash, "ts": int(time.time())})
            self.path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.path.with_suffix(".tmp")
            tmp.write_text(json.dumps(self._items), encoding="utf-8")
            tmp.replace(self.path)

    def __len__(self) -> int:
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
# App factory
# ---------------------------------------------------------------------------

def create_app(settings: Optional[Settings] = None, client: Optional[EscrowClient] = None) -> FastAPI:
    settings = settings or Settings.from_env()

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        if settings.agent_auto:
            agent.start()
        yield
        agent.stop()

    app = FastAPI(title="Escrow AI Attest Service", version="1.1.0", lifespan=lifespan)
    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    reports_dir = settings.data_dir / "reports"
    store = KnownHashStore(settings.data_dir / "known_hashes.json")
    registry = UriRegistry(settings.data_dir / "trade_uris.json")
    state = {"client": client}
    trade_locks: dict[int, threading.Lock] = {}
    trade_locks_guard = threading.Lock()

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

    rate_limit_lock = threading.Lock()
    rate_limit_records: dict[str, list[float]] = {}
    RATE_LIMIT_WINDOW = 60.0
    RATE_LIMIT_MAX_REQUESTS = 10

    def get_client() -> EscrowClient:
        if state["client"] is not None:
            return state["client"]
        missing = [k for k, v in (("RPC_URL", settings.rpc_url), ("AGENT_PRIVATE_KEY", settings.agent_private_key)) if not v]
        if missing:
            raise HTTPException(503, f"Thiếu cấu hình: {', '.join(missing)} (xem backend/.env.example)")
        if not settings.escrow_abi_path.exists():
            raise HTTPException(503, f"Không thấy ABI tại {settings.escrow_abi_path} — chạy `forge build` trong contracts/")
        abi = load_abi(settings.escrow_abi_path)
        address = settings.escrow_address
        if not address:
            from web3 import Web3
            cid = int(Web3(Web3.HTTPProvider(settings.rpc_url)).eth.chain_id)
            address = find_escrow_address(settings.deployments_dir, cid)
            if not address:
                raise HTTPException(503, f"Thiếu ESCROW_ADDRESS và không có contracts/deployments/{cid}.json")
        state["client"] = EscrowClient(settings.rpc_url, address, abi, settings.agent_private_key)
        log.info("Kết nối Escrow %s, agent %s", address, state["client"].agent_address)
        return state["client"]

    def get_chain_id(c: EscrowClient) -> int:
        if state.get("chain_id") is None:
            if hasattr(c, "chain_id") and callable(c.chain_id):
                state["chain_id"] = int(c.chain_id())
            else:
                state["chain_id"] = 31337
        return state["chain_id"]

    def check_security_guard(c: EscrowClient) -> None:
        cid = get_chain_id(c)
        reasons = insecure_reasons(settings, cid)
        if reasons:
            raise InsecureConfigError(reasons)

    def lock_for(trade_id: int) -> threading.Lock:
        with trade_locks_guard:
            return trade_locks.setdefault(trade_id, threading.Lock())

    @app.get("/health")
    def health():
        info = {"ok": True, "embedding_backend": ec.embedding_backend(), "known_hashes": len(store)}
        try:
            ec.pytesseract.get_tesseract_version()
            info["tesseract"] = True
        except Exception:
            info["tesseract"] = False
        cid = None
        reasons: list[str] = []
        try:
            c = get_client()
            cid = get_chain_id(c)
            reasons = insecure_reasons(settings, cid)
            info["chain_id"] = cid
            if hasattr(c, "escrow") and hasattr(c.escrow, "address"):
                info["escrow"] = c.escrow.address
            if hasattr(c, "agent_address"):
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
        info["security_toggles"] = {
            "api_key_set": bool(settings.attest_api_key and settings.attest_api_key.strip()),
            "allow_local_hosts": bool(settings.allow_local_hosts),
            "enforce_evidence_hash": bool(settings.enforce_evidence_hash),
            "ipfs_gateway_host": gw_host,
            "insecure_for_chain": bool(cid is not None and len(reasons) > 0),
        }

        agent_err = agent.last_error
        if reasons and not agent_err:
            agent_err = f"INSECURE_CONFIG: {', '.join(reasons)}"

        info.update({
            "agent_auto": settings.agent_auto,
            "agent_running": agent.running,
            "agent_last_tick": agent.last_tick,
            "agent_error": agent_err,
        })
        return info

    @app.get("/trade/{trade_id}")
    def get_trade(trade_id: int):
        try:
            t = get_client().get_trade(trade_id)
        except ChainError as e:
            raise HTTPException(502, str(e))
        if not t.exists:
            raise HTTPException(404, f"Trade {trade_id} không tồn tại")
        c = get_client()
        return {**t.to_json(), "nonce_short": ec.short_nonce(t.nonce),
                "seller_reputation": c.reputation_of(t.seller), "buyer_reputation": c.reputation_of(t.buyer)}

    @app.get("/trade/{trade_id}/nonce-qr.png")
    def nonce_qr(trade_id: int, size: int = 480):
        """Mã QR chứa nonce của giao dịch: đặt cạnh món hàng khi chụp thay cho viết tay.
        Sinh bằng cùng thư viện với bộ đọc trong ai-pipeline → chắc chắn đọc lại được."""
        try:
            t = get_client().get_trade(trade_id)
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
        f = reports_dir / f"{trade_id}.json"
        if not f.exists():
            raise HTTPException(404, f"Chưa có report cho trade {trade_id}")
        return json.loads(f.read_text(encoding="utf-8"))

    def check_api_key(x_api_key: Optional[str]) -> None:
        if settings.attest_api_key:
            if not x_api_key or x_api_key != settings.attest_api_key:
                raise HTTPException(status_code=401, detail="Invalid or missing API key")
        else:
            log.warning("ATTEST_API_KEY không được thiết lập - bỏ qua xác thực (chế độ dev)")

    def check_rate_limit(request: Request, bucket: str = "verify", limit: int = RATE_LIMIT_MAX_REQUESTS) -> None:
        """In-memory rate limiter per (bucket, IP); each endpoint group has its own quota."""
        client_ip = request.client.host if request.client and request.client.host else "127.0.0.1"
        key = client_ip if bucket == "verify" else f"{bucket}:{client_ip}"
        now = time.time()
        with rate_limit_lock:
            timestamps = rate_limit_records.get(key, [])
            timestamps = [t for t in timestamps if now - t < RATE_LIMIT_WINDOW]
            if len(timestamps) >= limit:
                rate_limit_records[key] = timestamps
                raise HTTPException(status_code=429, detail=f"Too Many Requests: Rate limit exceeded ({limit} req/min)")
            timestamps.append(now)
            rate_limit_records[key] = timestamps

    @app.post("/verify-evidence", response_model=VerifyResponse)
    def verify_evidence(
        req: VerifyRequest,
        request: Request,
        x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    ):
        check_api_key(x_api_key)   # 1. API Key Auth
        check_rate_limit(request)  # 2. Rate limit (10 req/min/IP)
        return run_verification(req)

    def run_verification(req: VerifyRequest) -> VerifyResponse:
        """Verification core shared by the manual endpoint and the autonomous agent (DEC-005 option A)."""
        started = time.time()
        c = get_client()
        check_security_guard(c)

        # 3. Validate listing_image_url scheme (must be ipfs://)
        if not req.listing_image_url.startswith("ipfs://"):
            raise HTTPException(status_code=422, detail="listing_image_url must be an ipfs:// URI")

        lock = lock_for(req.trade_id)
        if not lock.acquire(blocking=False):
            raise HTTPException(409, f"Trade {req.trade_id} đang được xử lý")
        try:
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
            registered_listing = registry.get(req.trade_id).get("listing")
            if not registered_listing:
                raise HTTPException(409, "Chưa có ảnh niêm yết đã ký trong sổ URI, cần seller ký xác nhận")
            if req.listing_image_url != registered_listing:
                raise HTTPException(422, "listing_image_url không khớp ảnh niêm yết seller đã ký")

            # 5. Bằng chứng phải đúng cái đã neo on-chain
            if settings.enforce_evidence_hash:
                if evidence_hash_of(req.seller_evidence_url) != trade.seller_evidence_hash:
                    raise HTTPException(422, "seller_evidence_url không khớp sellerEvidenceHash on-chain")
                if evidence_hash_of(req.buyer_evidence_url) != trade.buyer_evidence_hash:
                    raise HTTPException(422, "buyer_evidence_url không khớp buyerEvidenceHash on-chain")

            seller_rep = c.reputation_of(trade.seller)
            buyer_rep = c.reputation_of(trade.buyer)

            # 6. Tải và phân tích
            with tempfile.TemporaryDirectory(prefix=f"trade{req.trade_id}_") as wd:
                try:
                    listing = download(req.listing_image_url, settings, wd, "listing")
                    seller = download(req.seller_evidence_url, settings, wd, "seller")
                    buyer = download(req.buyer_evidence_url, settings, wd, "buyer")
                except DownloadError as e:
                    raise HTTPException(422, str(e))

                # Compute keccak256 hash of listing image
                with open(listing, "rb") as lf:
                    listing_bytes = lf.read()
                listing_hash = Web3.to_hex(Web3.keccak(listing_bytes)).lower()

                known, _ = store.hashes_excluding(req.trade_id)
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
                store.add(req.trade_id, "seller", result.seller_phash)
                store.add(req.trade_id, "buyer", result.buyer_phash)

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

            # 8. Lưu report (chỉ khi đã attest — đây là bản neo on-chain)
            if tx_hash:
                reports_dir.mkdir(parents=True, exist_ok=True)
                (reports_dir / f"{req.trade_id}.json").write_text(
                    json.dumps({**resp.model_dump(), "listing_hash": listing_hash, "evidence": {
                        "listing_image_url": req.listing_image_url,
                        "seller_evidence_url": req.seller_evidence_url,
                        "buyer_evidence_url": req.buyer_evidence_url,
                    }}, ensure_ascii=False), encoding="utf-8")
            return resp
        finally:
            lock.release()

    # -----------------------------------------------------------------------
    # Agent tự động: sổ URI + trạng thái
    # -----------------------------------------------------------------------

    def agent_verify(trade_id: int, uris: dict[str, str]) -> VerifyResponse:
        try:
            return run_verification(VerifyRequest(
                trade_id=trade_id, listing_image_url=uris["listing"],
                seller_evidence_url=uris["seller"], buyer_evidence_url=uris["buyer"],
            ))
        except InsecureConfigError as exc:
            agent.last_error = f"INSECURE_CONFIG: {', '.join(exc.reasons)}"
            raise

    agent = AutoAgent(get_client, registry, agent_verify, settings.agent_poll_seconds)
    app.state.agent = agent
    app.state.registry = registry

    def load_trade(trade_id: int):
        try:
            t = get_client().get_trade(trade_id)
        except ChainError as e:
            raise HTTPException(502, str(e))
        if not t.exists:
            raise HTTPException(404, f"Trade {trade_id} không tồn tại")
        return t

    @app.post("/trade/{trade_id}/uris")
    def register_uri(
        trade_id: int,
        body: UriRequest,
        request: Request,
        x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    ):
        """Báo cho agent biết URI thật của ảnh niêm yết / bằng chứng. Không tin client:
        bằng chứng phải khớp hash đã neo on-chain, ảnh niêm yết phải có chữ ký ví seller."""
        check_api_key(x_api_key)
        check_rate_limit(request, "uris", 60)
        c = get_client()
        check_security_guard(c)
        if not body.uri.startswith("ipfs://"):
            raise HTTPException(422, "uri must be an ipfs:// URI")
        t = load_trade(trade_id)
        if body.role == "listing":
            if not body.signature:
                raise HTTPException(422, "Thiếu chữ ký của seller cho ảnh niêm yết")
            msg = listing_message(get_chain_id(c), c.escrow.address, trade_id, body.uri)
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
        return {"enabled": settings.agent_auto, **agent.status_for(load_trade(trade_id))}

    return app


logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"),
                    format="%(asctime)s %(levelname)s %(name)s: %(message)s")

app = create_app()
