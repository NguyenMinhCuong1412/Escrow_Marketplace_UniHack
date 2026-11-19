"""
pin_relay.py
------------
Ops Pinata Upload Relay (DEC-024):
- Giữ `PINATA_JWT` hoàn toàn phía Ops Backend, không phân phối xuống client clone.
- Kiểm tra tệp hai lớp: không rỗng, magic bytes (JPEG/PNG/WEBP/MP4), khớp Content-Type khai báo,
  và giới hạn kích thước (10 MB ảnh, 50 MB video MP4) khớp 100% với `frontend/lib/pin-security.ts`.
- Áp dụng quota theo ví + IP lưu nguyên tử trong SQLite WAL (`pin_quota_events`).
- Fail-closed `503 IPFS_PROVIDER_UNCONFIGURED` khi thiếu `PINATA_JWT` ngoài Anvil `31337`;
  chỉ trả `mock` CID trên local Anvil `31337`.
"""

from __future__ import annotations

import hashlib
import re
import secrets
from typing import Any, Callable, Optional

import requests

MAX_IMAGE_BYTES = 10 * 1024 * 1024
MAX_VIDEO_BYTES = 50 * 1024 * 1024
LOCAL_ANVIL_CHAIN_ID = 31337
DEFAULT_PINATA_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS"

ALLOWED_MP4_BRANDS = frozenset({
    "isom", "iso2", "iso3", "iso4", "iso5", "iso6",
    "mp41", "mp42", "avc1", "hvc1", "hev1",
    "M4V ", "mp4v", "dash", "f4v ", "MSNV",
})

_EXT_MAP = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "video/mp4": "mp4",
}

_CID_RE = re.compile(r"^[A-Za-z0-9]{10,128}$")


class PinataRelayError(Exception):
    def __init__(self, status_code: int, error_code: str, message: str):
        self.status_code = int(status_code)
        self.error_code = str(error_code)
        self.message = str(message)
        super().__init__(message)


def detect_media_mime(data: bytes) -> Optional[str]:
    """Nhận diện định dạng MIME thực tế hoàn toàn từ magic bytes."""
    if not data or len(data) < 4:
        return None

    # PNG: 89 50 4E 47 0D 0A 1A 0A
    if len(data) >= 8 and data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"

    # JPEG: FF D8 FF <marker>
    if len(data) >= 4 and data[0] == 0xFF and data[1] == 0xD8 and data[2] == 0xFF and data[3] not in (0x00, 0xFF):
        return "image/jpeg"

    # WEBP: RIFF <4 bytes> WEBP
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"

    # MP4: ISO BMFF <4-byte BE size >= 16> "ftyp" <4-byte major brand>
    if len(data) >= 16 and data[4:8] == b"ftyp":
        box_size = int.from_bytes(data[0:4], "big")
        try:
            major_brand = data[8:12].decode("ascii")
        except UnicodeDecodeError:
            return None
        if 16 <= box_size <= len(data) and major_brand in ALLOWED_MP4_BRANDS:
            return "video/mp4"

    return None


def normalize_declared_mime(raw: Optional[str]) -> str:
    if not raw:
        return ""
    base = raw.split(";")[0].strip().lower()
    if base == "image/jpg":
        return "image/jpeg"
    if base == "image/x-png":
        return "image/png"
    return base


def validate_media_payload(data: bytes, declared_mime: Optional[str] = None) -> tuple[str, int]:
    """Kiểm tra rỗng, magic bytes, MIME khai báo và giới hạn dung lượng. Trả (detected_mime, size)."""
    if not data:
        raise PinataRelayError(400, "EMPTY_FILE", "Tệp tải lên bị rỗng.")

    detected = detect_media_mime(data)
    if not detected:
        raise PinataRelayError(
            415,
            "UNSUPPORTED_MEDIA_TYPE",
            "Nội dung tệp không hợp lệ. Chỉ hỗ trợ ảnh JPEG, PNG, WEBP hoặc video MP4.",
        )

    declared = normalize_declared_mime(declared_mime)
    if declared and declared != "application/octet-stream" and declared != detected:
        raise PinataRelayError(
            415,
            "MIME_MISMATCH",
            "Định dạng tệp không khớp với nội dung thực tế.",
        )

    max_bytes = MAX_VIDEO_BYTES if detected == "video/mp4" else MAX_IMAGE_BYTES
    if len(data) > max_bytes:
        raise PinataRelayError(
            413,
            "FILE_TOO_LARGE",
            "File vượt quá giới hạn (ảnh tối đa 10 MB, video MP4 tối đa 50 MB).",
        )

    return detected, len(data)


def upload_to_pinata_http(
    data: bytes,
    mime_type: str,
    pinata_jwt: str,
    *,
    pinata_url: str = DEFAULT_PINATA_URL,
    timeout: int = 30,
) -> str:
    ext = _EXT_MAP[mime_type]
    safe_name = f"marketplace-{secrets.token_hex(6)}.{ext}"
    try:
        res = requests.post(
            pinata_url,
            headers={"Authorization": f"Bearer {pinata_jwt}"},
            files={"file": (safe_name, data, mime_type)},
            timeout=timeout,
        )
    except requests.Timeout as exc:
        raise PinataRelayError(504, "IPFS_TIMEOUT", "Tải tệp lên IPFS quá thời gian chờ.") from exc
    except requests.RequestException as exc:
        raise PinataRelayError(502, "IPFS_UNREACHABLE", "Không kết nối được dịch vụ IPFS.") from exc

    if not res.ok:
        raise PinataRelayError(
            502,
            "IPFS_PROVIDER_ERROR",
            f"Dịch vụ lưu trữ IPFS từ chối tải tệp (HTTP {res.status_code}).",
        )

    try:
        body = res.json()
    except Exception as exc:
        raise PinataRelayError(502, "IPFS_INVALID_RESPONSE", "IPFS provider không trả về JSON hợp lệ.") from exc

    cid = str(body.get("IpfsHash") or "").strip() if isinstance(body, dict) else ""
    if not _CID_RE.match(cid):
        raise PinataRelayError(502, "IPFS_INVALID_RESPONSE", "IPFS provider không trả về CID hợp lệ.")
    return cid


def handle_pin_upload(
    *,
    db: Any,
    wallet: str,
    client_ip: str,
    chain_id: int,
    data: bytes,
    declared_mime: Optional[str],
    pinata_jwt: Optional[str],
    pinata_url: str = DEFAULT_PINATA_URL,
    quota_window_seconds: int = 3600,
    max_wallet_files: int = 20,
    max_wallet_bytes: int = 150 * 1024 * 1024,
    max_ip_files: int = 40,
    max_ip_bytes: int = 300 * 1024 * 1024,
    uploader: Optional[Callable[[bytes, str, str], str]] = None,
    now: Optional[int] = None,
) -> dict[str, Any]:
    detected_mime, size = validate_media_payload(data, declared_mime)

    jwt = (pinata_jwt or "").strip()
    if not jwt and int(chain_id) != LOCAL_ANVIL_CHAIN_ID:
        raise PinataRelayError(
            503,
            "IPFS_PROVIDER_UNCONFIGURED",
            "Dịch vụ lưu trữ IPFS chưa được cấu hình trên mạng này.",
        )

    allowed, reason = db.check_and_reserve_pin_quota(
        wallet,
        client_ip,
        size,
        now=now,
        window_seconds=quota_window_seconds,
        max_wallet_files=max_wallet_files,
        max_wallet_bytes=max_wallet_bytes,
        max_ip_files=max_ip_files,
        max_ip_bytes=max_ip_bytes,
    )
    if not allowed:
        target = "ví" if reason == "wallet" else "địa chỉ IP"
        raise PinataRelayError(
            429,
            "PIN_QUOTA_EXCEEDED",
            f"Vượt giới hạn tải tệp IPFS theo {target}. Vui lòng thử lại sau.",
        )

    if not jwt:
        # Chỉ cho phép trên Anvil local (31337)
        digest = hashlib.sha256(data).hexdigest()
        cid = f"mock{digest[:46]}"
        return {
            "cid": cid,
            "uri": f"ipfs://{cid}",
            "mock": True,
            "mime_type": detected_mime,
            "size": size,
        }

    upload_fn = uploader or (lambda b, m, j: upload_to_pinata_http(b, m, j, pinata_url=pinata_url))
    cid = upload_fn(data, detected_mime, jwt)
    if not isinstance(cid, str) or not _CID_RE.match(cid.strip()):
        raise PinataRelayError(502, "IPFS_INVALID_RESPONSE", "IPFS provider không trả về CID hợp lệ.")
    cid = cid.strip()
    return {
        "cid": cid,
        "uri": f"ipfs://{cid}",
        "mock": False,
        "mime_type": detected_mime,
        "size": size,
    }
