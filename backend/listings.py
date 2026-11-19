"""
listings.py
-----------
Business logic cho Marketplace: tin đăng đồ sưu tầm (multi-image, SKU, danh mục,
tình trạng, giá wei/AVAX), yêu cầu mua hàng, giữ chỗ nguyên tử (`BEGIN IMMEDIATE`),
TTL 30 phút, liên kết `listingId` <-> `tradeId` verify từ RPC, đồng bộ trạng thái
chỉ đọc và phát hiện trùng SKU / cảnh báo trùng ảnh SHA-256 / pHash.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import re
import sqlite3
import tempfile
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Literal, Optional

import imagehash
from PIL import Image
from pydantic import BaseModel, ConfigDict, Field
from web3 import Web3

import evidence_check as ec
from chain import ChainError, ChainTxNotFound, ChainValidationError, EscrowClient, Trade, TradeState
from db import MarketplaceDB

log = logging.getLogger("attest.marketplace")

LISTING_CATEGORIES = ("LEGO", "MODEL_KIT", "FIGURE", "TRADING_CARD", "COIN", "OTHER")
LISTING_CONDITIONS = ("SEALED_NEW", "LIKE_NEW", "USED_GOOD", "USED_FAIR", "GRADED")
LISTING_STATUSES = ("ACTIVE", "RESERVED", "SOLD", "PAUSED", "CANCELLED")
SELLER_EDITABLE_STATUSES = ("ACTIVE", "PAUSED", "CANCELLED")
REQUEST_STATUSES = (
    "PENDING",
    "ACCEPTED",
    "REJECTED",
    "CANCELLED",
    "EXPIRED",
    "ESCROW_CREATED",
    "COMPLETED",
    "TRADE_CANCELLED",
)

DEPOSIT_BPS = 3000  # Phải khớp Escrow.MAX_DEPOSIT_BPS = 3000 (30% cọc AVAX, CDU 1:1)
DEFAULT_RESERVATION_TTL_SECONDS = 1800  # 30 phút

_SKU_RE = re.compile(r"^[A-Z0-9._-]{2,64}$")
_TX_HASH_RE = re.compile(r"^0x[0-9a-fA-F]{64}$")
_SAFE_URI_RE = re.compile(r"^ipfs://[A-Za-z0-9._:/-]+$")


class MarketplaceError(Exception):
    """Lỗi nghiệp vụ / xác thực chuẩn hóa (không lộ raw exception hay secret)."""

    def __init__(self, status_code: int, error_code: str, message: str, details: Optional[dict[str, Any]] = None):
        self.status_code = status_code
        self.error_code = error_code
        self.message = message
        self.details = details
        super().__init__(message)


# ---------------------------------------------------------------------------
# Pydantic Models (extra="forbid" ngăn client nhồi actor_wallet giả)
# ---------------------------------------------------------------------------

class ListingImageInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    uri: str = Field(min_length=8, max_length=2048)
    is_primary: bool = False


class CreateListingRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sku: str = Field(min_length=2, max_length=64)
    category: str = Field(min_length=2, max_length=32)
    title: str = Field(min_length=3, max_length=160)
    description: str = Field(default="", max_length=4000)
    price_wei: str | int
    condition: str = Field(min_length=2, max_length=32)
    quantity_total: int = Field(ge=1, le=10000)
    images: list[ListingImageInput] = Field(min_length=1, max_length=10)


class UpdateListingRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sku: Optional[str] = Field(default=None, min_length=2, max_length=64)
    category: Optional[str] = Field(default=None, min_length=2, max_length=32)
    title: Optional[str] = Field(default=None, min_length=3, max_length=160)
    description: Optional[str] = Field(default=None, max_length=4000)
    price_wei: Optional[str | int] = None
    condition: Optional[str] = Field(default=None, min_length=2, max_length=32)
    quantity_total: Optional[int] = Field(default=None, ge=1, le=10000)
    images: Optional[list[ListingImageInput]] = Field(default=None, min_length=1, max_length=10)
    status: Optional[str] = Field(default=None, min_length=2, max_length=32)


class CreatePurchaseRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    quantity: int = Field(default=1, ge=1, le=10000)
    buyer_note: str = Field(default="", max_length=1000)


class DecisionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    action: Literal["accept", "reject"]
    seller_note: str = Field(default="", max_length=1000)


class CancelRequestBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reason: str = Field(default="", max_length=500)


class BindTradeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tx_hash: str = Field(min_length=66, max_length=66)
    trade_id: Optional[int] = Field(default=None, gt=0)


# ---------------------------------------------------------------------------
# Chuẩn hóa & Bảo mật dữ liệu
# ---------------------------------------------------------------------------

def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:20]}"


def normalize_wallet(raw: str, field_name: str = "wallet") -> str:
    if not isinstance(raw, str) or not Web3.is_address(raw.strip()):
        raise MarketplaceError(422, "INVALID_WALLET", f"Địa chỉ ví không hợp lệ ({field_name}).")
    return raw.strip().lower()


def normalize_sku(raw: str) -> tuple[str, str]:
    clean = (raw or "").strip()
    sku_norm = clean.upper()
    if not _SKU_RE.match(sku_norm):
        raise MarketplaceError(
            422,
            "INVALID_SKU",
            "SKU phải dài 2-64 ký tự và chỉ gồm chữ, số, '.', '_' hoặc '-'.",
        )
    return clean, sku_norm


def normalize_title(raw: str) -> str:
    clean = " ".join((raw or "").strip().split())
    if len(clean) < 3 or len(clean) > 160:
        raise MarketplaceError(422, "INVALID_TITLE", "Tên sản phẩm phải từ 3 đến 160 ký tự.")
    return clean


def normalize_description(raw: str) -> str:
    return (raw or "").strip()[:4000]


def normalize_category(raw: str) -> str:
    val = (raw or "").strip().upper()
    if val not in LISTING_CATEGORIES:
        raise MarketplaceError(422, "INVALID_CATEGORY", f"Danh mục không hợp lệ. Chọn: {', '.join(LISTING_CATEGORIES)}.")
    return val


def normalize_condition(raw: str) -> str:
    val = (raw or "").strip().upper()
    if val not in LISTING_CONDITIONS:
        raise MarketplaceError(422, "INVALID_CONDITION", f"Tình trạng không hợp lệ. Chọn: {', '.join(LISTING_CONDITIONS)}.")
    return val


def parse_wei(raw: str | int, *, require_min_deposit: bool = False, field_name: str = "price_wei") -> str:
    if isinstance(raw, bool):
        raise MarketplaceError(422, "INVALID_WEI", f"{field_name} phải là số nguyên wei hợp lệ.")
    if isinstance(raw, int):
        val = raw
    elif isinstance(raw, str):
        s = raw.strip()
        if not s.isdigit():
            raise MarketplaceError(422, "INVALID_WEI", f"{field_name} phải là chuỗi số nguyên wei không âm.")
        val = int(s)
    else:
        raise MarketplaceError(422, "INVALID_WEI", f"{field_name} không đúng định dạng.")

    if val <= 0:
        raise MarketplaceError(422, "INVALID_PRICE", f"{field_name} phải lớn hơn 0 wei.")
    if require_min_deposit and (val * DEPOSIT_BPS) // 10000 <= 0:
        raise MarketplaceError(
            422,
            "PRICE_TOO_SMALL",
            "Giá sản phẩm quá nhỏ, tiền cọc 30% trên Escrow phải lớn hơn 0 wei.",
        )
    if val >= 10**39:
        raise MarketplaceError(422, "PRICE_TOO_LARGE", "Giá wei vượt quá giới hạn cho phép.")
    return str(val)


def parse_optional_wei(raw: Optional[str]) -> Optional[str]:
    if raw is None or not raw.strip():
        return None
    s = raw.strip()
    if not s.isdigit():
        raise MarketplaceError(422, "INVALID_WEI", "Giá lọc phải là số nguyên wei hợp lệ.")
    val = int(s)
    if val < 0 or val >= 10**39:
        raise MarketplaceError(422, "INVALID_WEI", "Giá lọc nằm ngoài phạm vi hợp lệ.")
    return str(val)


def deposit_for_wei(amount_wei: str | int) -> str:
    return str((int(amount_wei) * DEPOSIT_BPS) // 10000)


def validate_ipfs_uri(raw: str) -> tuple[str, str]:
    uri = (raw or "").strip()
    if not uri.startswith("ipfs://") or len(uri) > 2048 or not _SAFE_URI_RE.match(uri):
        raise MarketplaceError(422, "INVALID_IPFS_URI", "URI ảnh phải có định dạng ipfs://<CID> hợp lệ.")
    if ".." in uri.split("/"):
        raise MarketplaceError(422, "INVALID_IPFS_URI", "URI ảnh chứa đường dẫn không hợp lệ.")
    rest = uri[len("ipfs://"):].lstrip("/")
    cid = rest.split("/")[0].strip()
    if not cid:
        raise MarketplaceError(422, "INVALID_IPFS_URI", "Thiếu CID trong đường dẫn ipfs://.")
    return uri, cid


def normalize_images(images: list[ListingImageInput]) -> tuple[list[dict[str, Any]], str]:
    if not (1 <= len(images) <= 10):
        raise MarketplaceError(422, "INVALID_IMAGES", "Tin đăng phải có từ 1 đến 10 ảnh IPFS.")
    seen_uris: set[str] = set()
    primary_indices: list[int] = []
    normalized: list[dict[str, Any]] = []
    for idx, item in enumerate(images):
        uri, cid = validate_ipfs_uri(item.uri)
        if uri in seen_uris:
            raise MarketplaceError(422, "DUPLICATE_IMAGE_IN_LISTING", "Không được lặp cùng một URI ảnh trong một tin đăng.")
        seen_uris.add(uri)
        if item.is_primary:
            primary_indices.append(idx)
        normalized.append({
            "uri": uri,
            "cid": cid,
            "sort_order": idx,
            "is_primary": 1 if item.is_primary else 0,
        })

    if len(primary_indices) > 1:
        raise MarketplaceError(422, "MULTIPLE_PRIMARY_IMAGES", "Chỉ được chọn tối đa 1 ảnh chính làm ảnh gốc AI.")
    if not primary_indices:
        normalized[0]["is_primary"] = 1
        primary_uri = normalized[0]["uri"]
    else:
        primary_uri = normalized[primary_indices[0]]["uri"]
    return normalized, primary_uri


def compute_proxy_signature(
    secret: str,
    method: str,
    path: str,
    wallet: str,
    chain_id: int | str,
    timestamp: int | str,
    nonce: str,
) -> str:
    """Chữ ký HMAC-SHA256 dùng cho kênh tin cậy Next.js BFF -> FastAPI chống giả mạo & replay."""
    msg = f"{method.upper()}\n{path}\n{wallet.lower()}\n{chain_id}\n{timestamp}\n{nonce}"
    return hmac.new(secret.encode("utf-8"), msg.encode("utf-8"), hashlib.sha256).hexdigest()


def _request_hash(payload: Any) -> str:
    canonical = json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _escape_like(q: str) -> str:
    return q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


# ---------------------------------------------------------------------------
# Kiểm tra ảnh trùng lặp (Cảnh báo / Review Required — không chặn nhầm)
# ---------------------------------------------------------------------------

@dataclass
class ImageInspection:
    sha256: str = ""
    phash: str = ""
    warning: Optional[dict[str, Any]] = None


def inspect_primary_image(
    uri: str,
    settings: Any,
    download_fn: Optional[Callable[[str, Any, str, str], str]] = None,
) -> ImageInspection:
    """Tải và băm SHA-256 + pHash ảnh chính nếu inspect_listing_images được bật."""
    if not getattr(settings, "inspect_listing_images", False) or download_fn is None:
        return ImageInspection()

    with tempfile.TemporaryDirectory(prefix="mkt_img_") as wd:
        try:
            path = download_fn(uri, settings, wd, "primary")
        except Exception as e:
            msg = str(e)
            if "SSRF" in msg or "ALLOWED_HOSTS" in msg or "không hợp lệ" in msg:
                raise MarketplaceError(422, "UNSAFE_IMAGE_URI", "URI ảnh không vượt qua kiểm tra bảo mật gateway/SSRF.")
            log.warning("Không tải được ảnh listing để tính hash (tiếp tục non-blocking): %s", msg)
            return ImageInspection(warning={
                "code": "IMAGE_HASH_UNAVAILABLE",
                "severity": "info",
                "message": "Chưa tải được ảnh từ gateway IPFS để kiểm tra trùng lặp pHash; tin vẫn được lưu.",
            })

        try:
            raw = Path(path).read_bytes()
            sha256_hex = hashlib.sha256(raw).hexdigest()
            with Image.open(path) as im:
                phash_hex = str(imagehash.phash(im.convert("RGB")))
            return ImageInspection(sha256=sha256_hex, phash=phash_hex)
        except Exception as e:
            log.warning("Không giải mã được pHash cho ảnh listing: %s", e)
            return ImageInspection(warning={
                "code": "IMAGE_DECODE_WARNING",
                "severity": "review_required",
                "message": "Tệp ảnh chính không đọc được pHash tự động; cần người kiểm tra lại ảnh IPFS.",
            })


def detect_duplicate_image_warnings(
    conn: sqlite3.Connection,
    chain_id: int,
    escrow_address: str,
    seller_wallet: str,
    primary_uri: str,
    sha256_hex: str,
    phash_hex: str,
    exclude_listing_id: Optional[str] = None,
) -> tuple[bool, list[dict[str, Any]]]:
    """
    Chỉ cảnh báo / đánh dấu review_required khi phát hiện ảnh SHA-256 hoặc pHash tương tự
    (hoặc trùng URI IPFS), KHÔNG chặn tạo tin bán hợp lệ.
    """
    rows = conn.execute(
        """
        SELECT id, sku, seller_wallet, primary_image_uri, primary_image_sha256, primary_image_phash, status
        FROM listings
        WHERE chain_id = ?
          AND escrow_address = ?
          AND status IN ('ACTIVE', 'RESERVED', 'PAUSED')
          AND (? IS NULL OR id != ?)
        ORDER BY created_at DESC
        LIMIT 500
        """,
        (chain_id, escrow_address, exclude_listing_id, exclude_listing_id),
    ).fetchall()

    warnings: list[dict[str, Any]] = []
    target_ph = imagehash.hex_to_hash(phash_hex) if phash_hex else None

    for row in rows:
        matched_id = row["id"]
        matched_sku = row["sku"]
        same_seller = row["seller_wallet"] == seller_wallet

        if sha256_hex and row["primary_image_sha256"] and row["primary_image_sha256"] == sha256_hex:
            warnings.append({
                "code": "SIMILAR_IMAGE_SHA256",
                "severity": "review_required",
                "matched_listing_id": matched_id,
                "matched_sku": matched_sku,
                "same_seller": same_seller,
                "message": f"Ảnh chính trùng SHA-256 với tin đăng {matched_sku}; cần xem xét trước khi duyệt.",
            })
            continue

        if target_ph is not None and row["primary_image_phash"]:
            try:
                dist = int(target_ph - imagehash.hex_to_hash(row["primary_image_phash"]))
            except Exception:
                dist = 999
            if dist <= ec.PHASH_REUSE_THRESHOLD:
                warnings.append({
                    "code": "SIMILAR_IMAGE_PHASH",
                    "severity": "review_required",
                    "hamming_distance": dist,
                    "matched_listing_id": matched_id,
                    "matched_sku": matched_sku,
                    "same_seller": same_seller,
                    "message": f"Ảnh chính tương tự về mặt thị giác (pHash distance={dist}) với tin đăng {matched_sku}; cần xem xét.",
                })
                continue

        if primary_uri == row["primary_image_uri"]:
            warnings.append({
                "code": "SIMILAR_IMAGE_URI",
                "severity": "review_required",
                "matched_listing_id": matched_id,
                "matched_sku": matched_sku,
                "same_seller": same_seller,
                "message": f"Ảnh chính dùng cùng URI IPFS với tin đăng {matched_sku}; cần xem xét.",
            })

    review_required = any(w.get("severity") == "review_required" for w in warnings)
    return review_required, warnings[:5]


# ---------------------------------------------------------------------------
# Marketplace Service
# ---------------------------------------------------------------------------

class MarketplaceService:
    def __init__(
        self,
        db: MarketplaceDB,
        settings: Any,
        download_fn: Optional[Callable[[str, Any, str, str], str]] = None,
        clock: Callable[[], int] = lambda: int(time.time()),
    ):
        self.db = db
        self.settings = settings
        self.download_fn = download_fn
        self.clock = clock

    # -- Serialization helpers ---------------------------------------------

    def _listing_from_row(self, conn: sqlite3.Connection, row: sqlite3.Row, seller_reputation: Optional[int] = None) -> dict[str, Any]:
        imgs = conn.execute(
            "SELECT id, cid, uri, sha256, sort_order, is_primary FROM listing_images WHERE listing_id = ? ORDER BY sort_order ASC, id ASC",
            (row["id"],),
        ).fetchall()
        trades = conn.execute(
            """
            SELECT trade_id, request_id, tx_hash, synced_state, flagged, last_synced_at
            FROM listing_trades
            WHERE listing_id = ?
            ORDER BY id DESC
            """,
            (row["id"],),
        ).fetchall()
        qty_avail = max(0, int(row["quantity_total"]) - int(row["quantity_reserved"]) - int(row["quantity_sold"]))
        try:
            warnings = json.loads(row["image_warnings_json"] or "[]")
        except Exception:
            warnings = []
        return {
            "id": row["id"],
            "chain_id": int(row["chain_id"]),
            "escrow_address": row["escrow_address"],
            "seller_wallet": row["seller_wallet"],
            "sku": row["sku"],
            "sku_norm": row["sku_norm"],
            "category": row["category"],
            "title": row["title"],
            "description": row["description"],
            "price_wei": row["price_wei"],
            "deposit_required_wei": deposit_for_wei(row["price_wei"]),
            "collateral_asset": "AVAX",
            "accounting_token": "CDU",
            "condition": row["condition"],
            "quantity_total": int(row["quantity_total"]),
            "quantity_reserved": int(row["quantity_reserved"]),
            "quantity_sold": int(row["quantity_sold"]),
            "quantity_available": qty_avail,
            "primary_image_uri": row["primary_image_uri"],
            "primary_image_sha256": row["primary_image_sha256"],
            "primary_image_phash": row["primary_image_phash"],
            "images": [
                {
                    "id": int(im["id"]),
                    "cid": im["cid"],
                    "uri": im["uri"],
                    "sort_order": int(im["sort_order"]),
                    "is_primary": bool(im["is_primary"]),
                }
                for im in imgs
            ],
            "review_required": bool(row["image_review_required"]),
            "warnings": warnings,
            "status": row["status"],
            "seller_reputation": seller_reputation,
            "linked_trades": [
                {
                    "trade_id": int(tr["trade_id"]),
                    "request_id": tr["request_id"],
                    "tx_hash": tr["tx_hash"],
                    "synced_state": tr["synced_state"],
                    "flagged": bool(tr["flagged"]),
                    "last_synced_at": int(tr["last_synced_at"]),
                }
                for tr in trades
            ],
            "created_at": int(row["created_at"]),
            "updated_at": int(row["updated_at"]),
        }

    def _request_from_row(self, conn: sqlite3.Connection, row: sqlite3.Row) -> dict[str, Any]:
        listing = conn.execute(
            "SELECT id, sku, title, category, condition, primary_image_uri, status FROM listings WHERE id = ?",
            (row["listing_id"],),
        ).fetchone()
        trade = conn.execute(
            "SELECT trade_id, tx_hash, synced_state, flagged, last_synced_at FROM listing_trades WHERE request_id = ?",
            (row["id"],),
        ).fetchone()
        return {
            "id": row["id"],
            "listing_id": row["listing_id"],
            "chain_id": int(row["chain_id"]),
            "escrow_address": row["escrow_address"],
            "seller_wallet": row["seller_wallet"],
            "buyer_wallet": row["buyer_wallet"],
            "quantity": int(row["quantity"]),
            "unit_price_wei": row["unit_price_wei"],
            "total_value_wei": row["total_value_wei"],
            "deposit_required_wei": deposit_for_wei(row["total_value_wei"]),
            "collateral_asset": "AVAX",
            "accounting_token": "CDU",
            "buyer_note": row["buyer_note"],
            "seller_note": row["seller_note"],
            "status": row["status"],
            "reservation_expires_at": int(row["reservation_expires_at"]) if row["reservation_expires_at"] is not None else None,
            "trade_id": int(trade["trade_id"]) if trade else None,
            "tx_hash": trade["tx_hash"] if trade else None,
            "synced_state": trade["synced_state"] if trade else None,
            "listing": {
                "id": listing["id"],
                "sku": listing["sku"],
                "title": listing["title"],
                "category": listing["category"],
                "condition": listing["condition"],
                "primary_image_uri": listing["primary_image_uri"],
                "status": listing["status"],
            } if listing else None,
            "created_at": int(row["created_at"]),
            "updated_at": int(row["updated_at"]),
        }

    # -- TTL Expiry (Chỉ giải phóng khi xác minh an toàn on-chain) ---------

    def _has_matching_unbound_onchain_trade(
        self,
        req_row: sqlite3.Row,
        client: Any,
        bound_tids: set[int],
        trade_cache: dict[int, Trade],
        next_trade_id: int,
    ) -> bool:
        """Kiểm tra trên Escrow contract xem yêu cầu chưa bind có Trade khớp chưa hủy hay không."""
        row_keys = req_row.keys() if hasattr(req_row, "keys") else ()
        raw_min = req_row["min_onchain_trade_id"] if "min_onchain_trade_id" in row_keys else None
        start_tid = max(1, int(raw_min)) if raw_min is not None else 1
        seller = str(req_row["seller_wallet"]).lower()
        buyer = str(req_row["buyer_wallet"]).lower()
        expected_val = int(req_row["total_value_wei"])

        for tid in range(start_tid, next_trade_id):
            if tid in bound_tids:
                continue
            if tid not in trade_cache:
                trade_cache[tid] = client.get_trade(tid)
            t = trade_cache[tid]
            if not getattr(t, "exists", False):
                continue
            if (
                str(t.seller).lower() == seller
                and str(t.buyer).lower() == buyer
                and int(t.item_value) == expected_val
                and t.state != TradeState.Cancelled
            ):
                return True
        return False

    def _expire_requests_by_ids_locked(
        self,
        conn: sqlite3.Connection,
        now: int,
        request_ids: list[str],
    ) -> int:
        released = 0
        for req_id in request_ids:
            row = conn.execute(
                """
                SELECT pr.id, pr.listing_id, pr.quantity
                FROM purchase_requests pr
                WHERE pr.id = ?
                  AND pr.status = 'ACCEPTED'
                  AND pr.reservation_expires_at IS NOT NULL
                  AND pr.reservation_expires_at <= ?
                  AND NOT EXISTS (
                      SELECT 1 FROM listing_trades lt WHERE lt.request_id = pr.id
                  )
                """,
                (req_id, now),
            ).fetchone()
            if not row:
                continue
            cur = conn.execute(
                """
                UPDATE purchase_requests
                SET status = 'EXPIRED', updated_at = ?
                WHERE id = ? AND status = 'ACCEPTED'
                  AND NOT EXISTS (SELECT 1 FROM listing_trades lt WHERE lt.request_id = ?)
                """,
                (now, row["id"], row["id"]),
            )
            if cur.rowcount == 0:
                continue
            qty = int(row["quantity"])
            conn.execute(
                """
                UPDATE listings
                SET quantity_reserved = MAX(0, quantity_reserved - ?),
                    status = CASE
                        WHEN status = 'RESERVED' AND (quantity_total - MAX(0, quantity_reserved - ?) - quantity_sold) > 0
                        THEN 'ACTIVE'
                        ELSE status
                    END,
                    updated_at = ?
                WHERE id = ?
                """,
                (qty, qty, now, row["listing_id"]),
            )
            released += 1
        return released

    def expire_stale_reservations(
        self,
        chain_id: Optional[int] = None,
        escrow_address: Optional[str] = None,
        *,
        client: Optional[Any] = None,
    ) -> int:
        now = self.clock()
        query = """
            SELECT pr.id, pr.listing_id, pr.chain_id, pr.escrow_address, pr.seller_wallet,
                   pr.buyer_wallet, pr.quantity, pr.total_value_wei, pr.min_onchain_trade_id
            FROM purchase_requests pr
            WHERE pr.status = 'ACCEPTED'
              AND pr.reservation_expires_at IS NOT NULL
              AND pr.reservation_expires_at <= ?
              AND NOT EXISTS (
                  SELECT 1 FROM listing_trades lt WHERE lt.request_id = pr.id
              )
        """
        params: list[Any] = [now]
        if chain_id is not None and escrow_address is not None:
            query += " AND pr.chain_id = ? AND pr.escrow_address = ?"
            params.extend([chain_id, escrow_address.lower()])

        with self.db.read_conn() as rconn:
            candidates = rconn.execute(query, params).fetchall()
            if not candidates:
                return 0
            bound_by_scope: dict[tuple[int, str], set[int]] = {}
            grouped: dict[tuple[int, str], list[sqlite3.Row]] = {}
            for row in candidates:
                scope = (int(row["chain_id"]), str(row["escrow_address"]).lower())
                grouped.setdefault(scope, []).append(row)
            for scope in grouped:
                bound_rows = rconn.execute(
                    "SELECT trade_id FROM listing_trades WHERE chain_id = ? AND escrow_address = ?",
                    scope,
                ).fetchall()
                bound_by_scope[scope] = {int(r[0]) for r in bound_rows}

        verify_chain = bool(getattr(self.settings, "verify_chain_before_ttl_release", True))
        safe_to_expire: list[str] = []

        for (g_chain, g_escrow), rows in grouped.items():
            if not verify_chain:
                safe_to_expire.extend(str(r["id"]) for r in rows)
                continue

            if (
                client is None
                or not hasattr(client, "chain_id")
                or not hasattr(client, "next_trade_id")
                or not hasattr(client, "get_trade")
                or not hasattr(client, "escrow")
                or not hasattr(client.escrow, "address")
            ):
                log.warning(
                    "Bỏ qua giải phóng TTL (%d yêu cầu, chain=%s) do không có RPC/EscrowClient để xác minh on-chain.",
                    len(rows),
                    g_chain,
                )
                continue

            try:
                if int(client.chain_id()) != g_chain or client.escrow.address.lower() != g_escrow:
                    log.warning(
                        "Bỏ qua giải phóng TTL do client RPC không khớp chain=%s / escrow=%s.",
                        g_chain,
                        g_escrow,
                    )
                    continue

                next_id = int(client.next_trade_id())
                bound_tids = bound_by_scope.get((g_chain, g_escrow), set())
                trade_cache: dict[int, Trade] = {}

                for row in rows:
                    has_trade = self._has_matching_unbound_onchain_trade(
                        row, client, bound_tids, trade_cache, next_id
                    )
                    if has_trade:
                        log.warning(
                            "Giữ nguyên trạng thái ACCEPTED cho %s dù quá TTL vì phát hiện createTrade khớp trên chain chưa bind.",
                            row["id"],
                        )
                    else:
                        safe_to_expire.append(str(row["id"]))
            except Exception as exc:
                log.warning(
                    "Không thể xác minh trạng thái on-chain khi kiểm tra TTL (chain=%s): %s — giữ nguyên giữ chỗ an toàn.",
                    g_chain,
                    exc,
                )
                continue

        if not safe_to_expire:
            return 0
        with self.db.write_tx() as wconn:
            return self._expire_requests_by_ids_locked(wconn, now, safe_to_expire)

    # -- Idempotency helpers -----------------------------------------------

    def _check_idempotency_locked(
        self,
        conn: sqlite3.Connection,
        scope: str,
        key: Optional[str],
        req_hash: str,
    ) -> Optional[dict[str, Any]]:
        if not key:
            return None
        row = conn.execute(
            "SELECT request_hash, response_json FROM idempotency_records WHERE scope = ? AND idempotency_key = ?",
            (scope, key),
        ).fetchone()
        if not row:
            return None
        if row["request_hash"] != req_hash:
            raise MarketplaceError(409, "IDEMPOTENCY_CONFLICT", "Idempotency-Key đã được dùng cho một nội dung khác.")
        return json.loads(row["response_json"])

    def _save_idempotency_locked(
        self,
        conn: sqlite3.Connection,
        scope: str,
        key: Optional[str],
        req_hash: str,
        status_code: int,
        payload: dict[str, Any],
        now: int,
    ) -> None:
        if not key:
            return
        conn.execute(
            """
            INSERT OR IGNORE INTO idempotency_records
                (scope, idempotency_key, request_hash, status_code, response_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (scope, key, req_hash, status_code, json.dumps(payload, ensure_ascii=False), now),
        )

    # -- Listing CRUD & Search ---------------------------------------------

    def create_listing(
        self,
        actor_wallet: str,
        chain_id: int,
        escrow_address: str,
        body: CreateListingRequest,
        idempotency_key: Optional[str] = None,
    ) -> dict[str, Any]:
        seller = normalize_wallet(actor_wallet, "X-Authenticated-Wallet")
        escrow = escrow_address.lower()
        sku_clean, sku_norm = normalize_sku(body.sku)
        category = normalize_category(body.category)
        title = normalize_title(body.title)
        description = normalize_description(body.description)
        price_wei = parse_wei(body.price_wei, require_min_deposit=True)
        condition = normalize_condition(body.condition)
        images_norm, primary_uri = normalize_images(body.images)

        req_hash = _request_hash(body.model_dump())
        idem_scope = f"POST:/listings:{chain_id}:{escrow}:{seller}"

        # Fast idempotency check before fetching image hashes
        if idempotency_key:
            with self.db.read_conn() as rconn:
                cached = self._check_idempotency_locked(rconn, idem_scope, idempotency_key, req_hash)
                if cached is not None:
                    return cached

        inspection = inspect_primary_image(primary_uri, self.settings, self.download_fn)
        now = self.clock()
        listing_id = _new_id("lst")

        with self.db.write_tx() as conn:
            if idempotency_key:
                cached = self._check_idempotency_locked(conn, idem_scope, idempotency_key, req_hash)
                if cached is not None:
                    return cached

            dup_sku = conn.execute(
                """
                SELECT id FROM listings
                WHERE chain_id = ? AND escrow_address = ? AND seller_wallet = ? AND sku_norm = ?
                  AND status IN ('ACTIVE', 'RESERVED', 'PAUSED')
                """,
                (chain_id, escrow, seller, sku_norm),
            ).fetchone()
            if dup_sku:
                raise MarketplaceError(
                    409,
                    "DUPLICATE_ACTIVE_SKU",
                    f"SKU '{sku_norm}' đang tồn tại ở một tin đăng khác của bạn.",
                    {"existing_listing_id": dup_sku["id"]},
                )

            review_required, warnings = detect_duplicate_image_warnings(
                conn, chain_id, escrow, seller, primary_uri, inspection.sha256, inspection.phash
            )
            if inspection.warning:
                warnings.append(inspection.warning)
                if inspection.warning.get("severity") == "review_required":
                    review_required = True

            try:
                conn.execute(
                    """
                    INSERT INTO listings (
                        id, chain_id, escrow_address, seller_wallet, sku, sku_norm,
                        category, title, description, price_wei, condition,
                        quantity_total, quantity_reserved, quantity_sold,
                        primary_image_uri, primary_image_sha256, primary_image_phash,
                        image_review_required, image_warnings_json, status, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
                    """,
                    (
                        listing_id, chain_id, escrow, seller, sku_clean, sku_norm,
                        category, title, description, price_wei, condition,
                        body.quantity_total, primary_uri, inspection.sha256, inspection.phash,
                        1 if review_required else 0, json.dumps(warnings, ensure_ascii=False),
                        now, now,
                    ),
                )
            except sqlite3.IntegrityError:
                raise MarketplaceError(
                    409,
                    "DUPLICATE_ACTIVE_SKU",
                    f"SKU '{sku_norm}' đang tồn tại ở một tin đăng khác của bạn.",
                )

            for im in images_norm:
                sha = inspection.sha256 if im["is_primary"] == 1 else ""
                conn.execute(
                    """
                    INSERT INTO listing_images (listing_id, cid, uri, sha256, sort_order, is_primary)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (listing_id, im["cid"], im["uri"], sha, im["sort_order"], im["is_primary"]),
                )

            row = conn.execute("SELECT * FROM listings WHERE id = ?", (listing_id,)).fetchone()
            out = self._listing_from_row(conn, row)
            self._save_idempotency_locked(conn, idem_scope, idempotency_key, req_hash, 201, out, now)
            return out

    def update_listing(
        self,
        actor_wallet: str,
        chain_id: int,
        escrow_address: str,
        listing_id: str,
        body: UpdateListingRequest,
        *,
        client: Optional[Any] = None,
    ) -> dict[str, Any]:
        actor = normalize_wallet(actor_wallet, "X-Authenticated-Wallet")
        escrow = escrow_address.lower()
        now = self.clock()

        new_images_norm = None
        new_primary_uri = None
        inspection = ImageInspection()
        if body.images is not None:
            new_images_norm, new_primary_uri = normalize_images(body.images)
            inspection = inspect_primary_image(new_primary_uri, self.settings, self.download_fn)

        self.expire_stale_reservations(chain_id, escrow, client=client)

        with self.db.write_tx() as conn:
            row = conn.execute(
                "SELECT * FROM listings WHERE id = ? AND chain_id = ? AND escrow_address = ?",
                (listing_id, chain_id, escrow),
            ).fetchone()
            if not row:
                raise MarketplaceError(404, "LISTING_NOT_FOUND", "Không tìm thấy tin đăng.")
            if row["seller_wallet"] != actor:
                raise MarketplaceError(403, "FORBIDDEN", "Chỉ người bán sở hữu tin đăng mới có quyền chỉnh sửa.")
            if row["status"] in ("SOLD", "CANCELLED"):
                raise MarketplaceError(409, "LISTING_FINALIZED", f"Tin đăng đã ở trạng thái {row['status']}, không thể chỉnh sửa.")

            qty_reserved = int(row["quantity_reserved"])
            qty_sold = int(row["quantity_sold"])
            has_reserved = qty_reserved > 0

            # Chặn thay đổi thông số nhạy cảm khi đang có đơn giữ chỗ
            if has_reserved and (
                body.price_wei is not None
                or body.sku is not None
                or body.category is not None
                or body.condition is not None
                or body.images is not None
            ):
                raise MarketplaceError(
                    409,
                    "LISTING_HAS_RESERVATIONS",
                    "Tin đăng đang có đơn giữ chỗ/Escrow, không thể đổi giá, SKU, danh mục, tình trạng hoặc ảnh.",
                )

            sku_clean = row["sku"]
            sku_norm = row["sku_norm"]
            if body.sku is not None:
                sku_clean, sku_norm = normalize_sku(body.sku)
                if sku_norm != row["sku_norm"]:
                    dup = conn.execute(
                        """
                        SELECT id FROM listings
                        WHERE chain_id = ? AND escrow_address = ? AND seller_wallet = ? AND sku_norm = ?
                          AND status IN ('ACTIVE', 'RESERVED', 'PAUSED') AND id != ?
                        """,
                        (chain_id, escrow, actor, sku_norm, listing_id),
                    ).fetchone()
                    if dup:
                        raise MarketplaceError(409, "DUPLICATE_ACTIVE_SKU", f"SKU '{sku_norm}' đang được dùng ở tin đăng khác.")

            category = normalize_category(body.category) if body.category is not None else row["category"]
            condition = normalize_condition(body.condition) if body.condition is not None else row["condition"]
            title = normalize_title(body.title) if body.title is not None else row["title"]
            description = normalize_description(body.description) if body.description is not None else row["description"]
            price_wei = parse_wei(body.price_wei, require_min_deposit=True) if body.price_wei is not None else row["price_wei"]

            qty_total = int(row["quantity_total"])
            if body.quantity_total is not None:
                if body.quantity_total < qty_reserved + qty_sold:
                    raise MarketplaceError(
                        409,
                        "INVALID_QUANTITY_REDUCTION",
                        "Tổng số lượng mới không thể nhỏ hơn số lượng đang giữ chỗ + đã bán.",
                    )
                qty_total = body.quantity_total

            status = row["status"]
            if body.status is not None:
                req_status = body.status.strip().upper()
                if req_status not in SELLER_EDITABLE_STATUSES:
                    raise MarketplaceError(
                        422,
                        "INVALID_LISTING_STATUS",
                        f"Chỉ được chuyển sang trạng thái: {', '.join(SELLER_EDITABLE_STATUSES)}.",
                    )
                if req_status == "CANCELLED" and has_reserved:
                    raise MarketplaceError(409, "LISTING_HAS_RESERVATIONS", "Không thể hủy tin đăng khi đang có đơn giữ chỗ.")
                if req_status == "PAUSED" and has_reserved:
                    raise MarketplaceError(409, "LISTING_HAS_RESERVATIONS", "Không thể tạm ẩn khi đang có đơn giữ chỗ.")
                if req_status == "ACTIVE" and (qty_total - qty_reserved - qty_sold) <= 0:
                    raise MarketplaceError(409, "NO_AVAILABLE_STOCK", "Không còn tồn kho khả dụng để mở bán ACTIVE.")
                status = req_status
            elif body.quantity_total is not None and status == "RESERVED" and (qty_total - qty_reserved - qty_sold) > 0:
                status = "ACTIVE"

            primary_uri = row["primary_image_uri"]
            primary_sha = row["primary_image_sha256"]
            primary_phash = row["primary_image_phash"]
            review_required = bool(row["image_review_required"])
            warnings_json = row["image_warnings_json"]

            if new_images_norm is not None and new_primary_uri is not None:
                primary_uri = new_primary_uri
                primary_sha = inspection.sha256
                primary_phash = inspection.phash
                review_required, warnings = detect_duplicate_image_warnings(
                    conn, chain_id, escrow, actor, primary_uri, primary_sha, primary_phash, exclude_listing_id=listing_id
                )
                if inspection.warning:
                    warnings.append(inspection.warning)
                    if inspection.warning.get("severity") == "review_required":
                        review_required = True
                warnings_json = json.dumps(warnings, ensure_ascii=False)

                conn.execute("DELETE FROM listing_images WHERE listing_id = ?", (listing_id,))
                for im in new_images_norm:
                    sha = primary_sha if im["is_primary"] == 1 else ""
                    conn.execute(
                        """
                        INSERT INTO listing_images (listing_id, cid, uri, sha256, sort_order, is_primary)
                        VALUES (?, ?, ?, ?, ?, ?)
                        """,
                        (listing_id, im["cid"], im["uri"], sha, im["sort_order"], im["is_primary"]),
                    )

            try:
                conn.execute(
                    """
                    UPDATE listings
                    SET sku = ?, sku_norm = ?, category = ?, title = ?, description = ?,
                        price_wei = ?, condition = ?, quantity_total = ?,
                        primary_image_uri = ?, primary_image_sha256 = ?, primary_image_phash = ?,
                        image_review_required = ?, image_warnings_json = ?,
                        status = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (
                        sku_clean, sku_norm, category, title, description,
                        price_wei, condition, qty_total,
                        primary_uri, primary_sha, primary_phash,
                        1 if review_required else 0, warnings_json,
                        status, now, listing_id,
                    ),
                )
            except sqlite3.IntegrityError:
                raise MarketplaceError(409, "DUPLICATE_ACTIVE_SKU", f"SKU '{sku_norm}' đang được dùng ở tin đăng khác.")

            updated = conn.execute("SELECT * FROM listings WHERE id = ?", (listing_id,)).fetchone()
            return self._listing_from_row(conn, updated)

    def get_listing(
        self,
        chain_id: int,
        escrow_address: str,
        listing_id: str,
        reputation_lookup: Optional[Callable[[str], Optional[int]]] = None,
        *,
        client: Optional[Any] = None,
    ) -> dict[str, Any]:
        escrow = escrow_address.lower()
        now = self.clock()
        with self.db.read_conn() as conn:
            has_expired = self._has_expired_unbound_reservations(conn, chain_id, escrow, now)
        verify_chain = bool(getattr(self.settings, "verify_chain_before_ttl_release", True))
        if has_expired and (not verify_chain or client is not None):
            self.expire_stale_reservations(chain_id, escrow, client=client)
        with self.db.read_conn() as conn:
            row = conn.execute(
                "SELECT * FROM listings WHERE id = ? AND chain_id = ? AND escrow_address = ?",
                (listing_id, chain_id, escrow),
            ).fetchone()
            if not row:
                raise MarketplaceError(404, "LISTING_NOT_FOUND", "Không tìm thấy tin đăng.")
            rep = reputation_lookup(row["seller_wallet"]) if reputation_lookup else None
            return self._listing_from_row(conn, row, seller_reputation=rep)

    def get_listings_version(self) -> int:
        """Trả version tăng đơn điệu mỗi khi listings/images/trades thay đổi (qua SQLite triggers)."""
        return self.db.get_listings_version()

    def has_expired_unbound_reservations(self, chain_id: int, escrow_address: str) -> bool:
        """Kiểm tra có reservation quá hạn cần đối soát TTL trước khi trả cache ETag hay không."""
        with self.db.read_conn() as conn:
            return self._has_expired_unbound_reservations(conn, chain_id, escrow_address.lower(), self.clock())

    def _has_expired_unbound_reservations(
        self,
        conn: sqlite3.Connection,
        chain_id: int,
        escrow_address: str,
        now: int,
    ) -> bool:
        """Kiểm tra O(1) qua partial index idx_requests_expiry xem có giữ chỗ quá hạn chưa xử lý."""
        row = conn.execute(
            """
            SELECT 1
            FROM purchase_requests pr
            WHERE pr.status = 'ACCEPTED'
              AND pr.reservation_expires_at IS NOT NULL
              AND pr.reservation_expires_at <= ?
              AND pr.chain_id = ?
              AND pr.escrow_address = ?
              AND NOT EXISTS (
                  SELECT 1 FROM listing_trades lt WHERE lt.request_id = pr.id
              )
            LIMIT 1
            """,
            (now, chain_id, escrow_address),
        ).fetchone()
        return row is not None

    def _fetch_listings_page(
        self,
        conn: sqlite3.Connection,
        where_sql: str,
        params: list[Any],
        order_sql: str,
        limit: int,
        offset: int,
    ) -> tuple[int, list[dict[str, Any]]]:
        total = int(conn.execute(f"SELECT COUNT(*) FROM listings WHERE {where_sql}", params).fetchone()[0])
        rows = conn.execute(
            f"SELECT * FROM listings WHERE {where_sql} ORDER BY {order_sql} LIMIT ? OFFSET ?",
            [*params, limit, offset],
        ).fetchall()
        items = [self._listing_from_row(conn, r) for r in rows]
        return total, items

    def list_listings(
        self,
        chain_id: int,
        escrow_address: str,
        *,
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
        client: Optional[Any] = None,
    ) -> dict[str, Any]:
        # Đường đọc công khai GET /listings thuần đọc SQLite trong trạng thái bình thường
        # (không chạy quét TTL định kỳ khi không có giữ chỗ quá hạn); khi phát hiện thực sự có
        # reservation quá hạn chưa kịp đối soát bởi worker, tự fallback kiểm tra chain & đồng bộ
        # để bảo toàn nguyên trạng thái/tồn kho như phiên bản trước.
        escrow = escrow_address.lower()

        clauses = ["chain_id = ?", "escrow_address = ?"]
        params: list[Any] = [chain_id, escrow]

        if seller:
            seller_norm = normalize_wallet(seller, "seller")
            clauses.append("seller_wallet = ?")
            params.append(seller_norm)

        if status and status.strip().upper() != "ALL":
            requested_statuses = [s.strip().upper() for s in status.split(",") if s.strip()]
            for s in requested_statuses:
                if s not in LISTING_STATUSES:
                    raise MarketplaceError(422, "INVALID_LISTING_STATUS", f"Trạng thái lọc không hợp lệ: {s}")
            placeholders = ",".join("?" for _ in requested_statuses)
            clauses.append(f"status IN ({placeholders})")
            params.extend(requested_statuses)

        if category:
            cat = normalize_category(category)
            clauses.append("category = ?")
            params.append(cat)

        if condition:
            cond = normalize_condition(condition)
            clauses.append("condition = ?")
            params.append(cond)

        if q and q.strip():
            like = f"%{_escape_like(q.strip().lower())}%"
            clauses.append("(LOWER(title) LIKE ? ESCAPE '\\' OR LOWER(sku) LIKE ? ESCAPE '\\' OR LOWER(description) LIKE ? ESCAPE '\\')")
            params.extend([like, like, like])

        min_p = parse_optional_wei(min_price_wei)
        if min_p is not None:
            clauses.append("(LENGTH(price_wei) > LENGTH(?) OR (LENGTH(price_wei) = LENGTH(?) AND price_wei >= ?))")
            params.extend([min_p, min_p, min_p])

        max_p = parse_optional_wei(max_price_wei)
        if max_p is not None:
            clauses.append("(LENGTH(price_wei) < LENGTH(?) OR (LENGTH(price_wei) = LENGTH(?) AND price_wei <= ?))")
            params.extend([max_p, max_p, max_p])

        if min_p is not None and max_p is not None and int(min_p) > int(max_p):
            raise MarketplaceError(422, "INVALID_PRICE_RANGE", "min_price_wei không được lớn hơn max_price_wei.")

        if in_stock_only:
            clauses.append("(quantity_total - quantity_reserved - quantity_sold) > 0")

        sort_map = {
            "newest": "created_at DESC, id DESC",
            "price_asc": "LENGTH(price_wei) ASC, price_wei ASC, created_at DESC",
            "price_desc": "LENGTH(price_wei) DESC, price_wei DESC, created_at DESC",
        }
        if sort not in sort_map:
            raise MarketplaceError(422, "INVALID_SORT", "Kiểu sắp xếp không hợp lệ (newest, price_asc, price_desc).")

        page = max(1, int(page))
        limit = max(1, min(100, int(limit)))
        offset = (page - 1) * limit
        where_sql = " AND ".join(clauses)
        order_sql = sort_map[sort]
        now = self.clock()
        needs_expiry_sync = False

        with self.db.read_conn() as conn:
            has_expired = self._has_expired_unbound_reservations(conn, chain_id, escrow, now)
            verify_chain = bool(getattr(self.settings, "verify_chain_before_ttl_release", True))
            if has_expired and (not verify_chain or client is not None):
                needs_expiry_sync = True
            else:
                total, items = self._fetch_listings_page(conn, where_sql, params, order_sql, limit, offset)

        if needs_expiry_sync:
            self.expire_stale_reservations(chain_id, escrow, client=client)
            with self.db.read_conn() as conn:
                total, items = self._fetch_listings_page(conn, where_sql, params, order_sql, limit, offset)

        total_pages = (total + limit - 1) // limit if total > 0 else 0
        return {
            "items": items,
            "total": total,
            "page": page,
            "limit": limit,
            "total_pages": total_pages,
        }

    # -- Purchase Requests & Giữ Chỗ Nguyên Tử -----------------------------

    def create_purchase_request(
        self,
        actor_wallet: str,
        chain_id: int,
        escrow_address: str,
        listing_id: str,
        body: CreatePurchaseRequest,
        idempotency_key: Optional[str] = None,
        *,
        client: Optional[Any] = None,
    ) -> dict[str, Any]:
        buyer = normalize_wallet(actor_wallet, "X-Authenticated-Wallet")
        escrow = escrow_address.lower()
        now = self.clock()
        req_hash = _request_hash(body.model_dump())
        idem_scope = f"POST:/listings/{listing_id}/requests:{chain_id}:{escrow}:{buyer}"

        if idempotency_key:
            with self.db.read_conn() as rconn:
                cached = self._check_idempotency_locked(rconn, idem_scope, idempotency_key, req_hash)
                if cached is not None:
                    return cached

        self.expire_stale_reservations(chain_id, escrow, client=client)

        with self.db.write_tx() as conn:
            if idempotency_key:
                cached = self._check_idempotency_locked(conn, idem_scope, idempotency_key, req_hash)
                if cached is not None:
                    return cached

            listing = conn.execute(
                "SELECT * FROM listings WHERE id = ? AND chain_id = ? AND escrow_address = ?",
                (listing_id, chain_id, escrow),
            ).fetchone()
            if not listing:
                raise MarketplaceError(404, "LISTING_NOT_FOUND", "Không tìm thấy sản phẩm.")
            if listing["seller_wallet"] == buyer:
                raise MarketplaceError(403, "CANNOT_BUY_OWN_LISTING", "Người bán không thể tự gửi yêu cầu mua sản phẩm của mình.")
            if listing["status"] != "ACTIVE":
                raise MarketplaceError(409, "LISTING_UNAVAILABLE", f"Sản phẩm đang ở trạng thái {listing['status']}, chưa sẵn sàng nhận yêu cầu mới.")

            avail = int(listing["quantity_total"]) - int(listing["quantity_reserved"]) - int(listing["quantity_sold"])
            if avail < body.quantity:
                raise MarketplaceError(409, "INSUFFICIENT_STOCK", f"Số lượng khả dụng chỉ còn {avail}.")

            dup = conn.execute(
                """
                SELECT id FROM purchase_requests
                WHERE listing_id = ? AND buyer_wallet = ? AND status IN ('PENDING', 'ACCEPTED')
                """,
                (listing_id, buyer),
            ).fetchone()
            if dup:
                raise MarketplaceError(
                    409,
                    "DUPLICATE_ACTIVE_REQUEST",
                    "Bạn đã có yêu cầu đang chờ hoặc đã được giữ chỗ cho sản phẩm này.",
                    {"existing_request_id": dup["id"]},
                )

            req_id = _new_id("req")
            unit_price = listing["price_wei"]
            total_value = str(int(unit_price) * body.quantity)
            conn.execute(
                """
                INSERT INTO purchase_requests (
                    id, listing_id, chain_id, escrow_address, seller_wallet, buyer_wallet,
                    quantity, unit_price_wei, total_value_wei, buyer_note, seller_note,
                    status, reservation_expires_at, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', 'PENDING', NULL, ?, ?)
                """,
                (
                    req_id, listing_id, chain_id, escrow, listing["seller_wallet"], buyer,
                    body.quantity, unit_price, total_value, (body.buyer_note or "").strip()[:1000],
                    now, now,
                ),
            )
            row = conn.execute("SELECT * FROM purchase_requests WHERE id = ?", (req_id,)).fetchone()
            out = self._request_from_row(conn, row)
            self._save_idempotency_locked(conn, idem_scope, idempotency_key, req_hash, 201, out, now)
            return out

    def list_requests(
        self,
        actor_wallet: str,
        chain_id: int,
        escrow_address: str,
        *,
        role: str = "all",
        status: Optional[str] = None,
        page: int = 1,
        limit: int = 20,
        client: Optional[Any] = None,
    ) -> dict[str, Any]:
        actor = normalize_wallet(actor_wallet, "X-Authenticated-Wallet")
        escrow = escrow_address.lower()
        role_norm = (role or "all").strip().lower()
        if role_norm not in ("buyer", "seller", "all"):
            raise MarketplaceError(422, "INVALID_ROLE", "role phải là buyer, seller hoặc all.")

        self.expire_stale_reservations(chain_id, escrow, client=client)

        clauses = ["chain_id = ?", "escrow_address = ?"]
        params: list[Any] = [chain_id, escrow]
        if role_norm == "buyer":
            clauses.append("buyer_wallet = ?")
            params.append(actor)
        elif role_norm == "seller":
            clauses.append("seller_wallet = ?")
            params.append(actor)
        else:
            clauses.append("(buyer_wallet = ? OR seller_wallet = ?)")
            params.extend([actor, actor])

        if status and status.strip().upper() != "ALL":
            req_statuses = [s.strip().upper() for s in status.split(",") if s.strip()]
            for s in req_statuses:
                if s not in REQUEST_STATUSES:
                    raise MarketplaceError(422, "INVALID_REQUEST_STATUS", f"Trạng thái yêu cầu không hợp lệ: {s}")
            placeholders = ",".join("?" for _ in req_statuses)
            clauses.append(f"status IN ({placeholders})")
            params.extend(req_statuses)

        page = max(1, int(page))
        limit = max(1, min(100, int(limit)))
        offset = (page - 1) * limit
        where_sql = " AND ".join(clauses)

        with self.db.read_conn() as conn:
            total = int(conn.execute(f"SELECT COUNT(*) FROM purchase_requests WHERE {where_sql}", params).fetchone()[0])
            rows = conn.execute(
                f"SELECT * FROM purchase_requests WHERE {where_sql} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
                [*params, limit, offset],
            ).fetchall()
            items = [self._request_from_row(conn, r) for r in rows]

        return {
            "items": items,
            "total": total,
            "page": page,
            "limit": limit,
            "total_pages": (total + limit - 1) // limit if total > 0 else 0,
        }

    def get_request(
        self,
        actor_wallet: str,
        chain_id: int,
        escrow_address: str,
        request_id: str,
        *,
        client: Optional[Any] = None,
    ) -> dict[str, Any]:
        actor = normalize_wallet(actor_wallet, "X-Authenticated-Wallet")
        escrow = escrow_address.lower()
        self.expire_stale_reservations(chain_id, escrow, client=client)
        with self.db.read_conn() as conn:
            row = conn.execute(
                "SELECT * FROM purchase_requests WHERE id = ? AND chain_id = ? AND escrow_address = ?",
                (request_id, chain_id, escrow),
            ).fetchone()
            if not row:
                raise MarketplaceError(404, "REQUEST_NOT_FOUND", "Không tìm thấy yêu cầu mua hàng.")
            if actor not in (row["seller_wallet"], row["buyer_wallet"]):
                raise MarketplaceError(403, "FORBIDDEN", "Bạn không phải bên liên quan của yêu cầu này.")
            return self._request_from_row(conn, row)

    def decide_request(
        self,
        actor_wallet: str,
        chain_id: int,
        escrow_address: str,
        request_id: str,
        body: DecisionRequest,
        idempotency_key: Optional[str] = None,
        *,
        client: Optional[Any] = None,
    ) -> dict[str, Any]:
        actor = normalize_wallet(actor_wallet, "X-Authenticated-Wallet")
        escrow = escrow_address.lower()
        now = self.clock()
        ttl = int(getattr(self.settings, "reservation_ttl_seconds", DEFAULT_RESERVATION_TTL_SECONDS) or DEFAULT_RESERVATION_TTL_SECONDS)
        req_hash = _request_hash(body.model_dump())
        idem_scope = f"POST:/requests/{request_id}/decision:{chain_id}:{escrow}:{actor}"

        if idempotency_key:
            with self.db.read_conn() as rconn:
                cached = self._check_idempotency_locked(rconn, idem_scope, idempotency_key, req_hash)
                if cached is not None:
                    return cached

        self.expire_stale_reservations(chain_id, escrow, client=client)

        min_onchain_trade_id: Optional[int] = None
        if body.action == "accept" and client is not None and hasattr(client, "next_trade_id"):
            try:
                if (
                    hasattr(client, "chain_id")
                    and hasattr(client, "escrow")
                    and int(client.chain_id()) == chain_id
                    and client.escrow.address.lower() == escrow
                ):
                    min_onchain_trade_id = int(client.next_trade_id())
            except Exception as exc:
                log.warning("Không đọc được nextTradeId khi accept %s: %s", request_id, exc)
                min_onchain_trade_id = None

        with self.db.write_tx() as conn:
            if idempotency_key:
                cached = self._check_idempotency_locked(conn, idem_scope, idempotency_key, req_hash)
                if cached is not None:
                    return cached

            req_row = conn.execute(
                "SELECT * FROM purchase_requests WHERE id = ? AND chain_id = ? AND escrow_address = ?",
                (request_id, chain_id, escrow),
            ).fetchone()
            if not req_row:
                raise MarketplaceError(404, "REQUEST_NOT_FOUND", "Không tìm thấy yêu cầu mua hàng.")
            if req_row["seller_wallet"] != actor:
                raise MarketplaceError(403, "FORBIDDEN", "Chỉ người bán của sản phẩm mới được xác nhận hoặc từ chối.")
            if req_row["status"] != "PENDING":
                raise MarketplaceError(409, "INVALID_REQUEST_STATE", f"Yêu cầu đã ở trạng thái {req_row['status']}.")

            note = (body.seller_note or "").strip()[:1000]
            if body.action == "reject":
                conn.execute(
                    """
                    UPDATE purchase_requests
                    SET status = 'REJECTED', seller_note = ?, updated_at = ?
                    WHERE id = ? AND status = 'PENDING'
                    """,
                    (note, now, request_id),
                )
            else:
                qty = int(req_row["quantity"])
                cur = conn.execute(
                    """
                    UPDATE listings
                    SET quantity_reserved = quantity_reserved + ?,
                        status = CASE
                            WHEN (quantity_total - (quantity_reserved + ?) - quantity_sold) = 0 THEN 'RESERVED'
                            ELSE 'ACTIVE'
                        END,
                        updated_at = ?
                    WHERE id = ?
                      AND chain_id = ?
                      AND escrow_address = ?
                      AND status = 'ACTIVE'
                      AND (quantity_total - quantity_reserved - quantity_sold) >= ?
                    """,
                    (qty, qty, now, req_row["listing_id"], chain_id, escrow, qty),
                )
                if cur.rowcount == 0:
                    raise MarketplaceError(
                        409,
                        "OUT_OF_STOCK_OR_RESERVED",
                        "Sản phẩm không còn đủ số lượng khả dụng để giữ chỗ.",
                    )

                expires_at = now + max(1, ttl)
                conn.execute(
                    """
                    UPDATE purchase_requests
                    SET status = 'ACCEPTED', seller_note = ?, reservation_expires_at = ?,
                        min_onchain_trade_id = ?, updated_at = ?
                    WHERE id = ? AND status = 'PENDING'
                    """,
                    (note, expires_at, min_onchain_trade_id, now, request_id),
                )

            updated = conn.execute("SELECT * FROM purchase_requests WHERE id = ?", (request_id,)).fetchone()
            out = self._request_from_row(conn, updated)
            self._save_idempotency_locked(conn, idem_scope, idempotency_key, req_hash, 200, out, now)
            return out

    def cancel_request(
        self,
        actor_wallet: str,
        chain_id: int,
        escrow_address: str,
        request_id: str,
        body: Optional[CancelRequestBody] = None,
        idempotency_key: Optional[str] = None,
        *,
        client: Optional[Any] = None,
    ) -> dict[str, Any]:
        actor = normalize_wallet(actor_wallet, "X-Authenticated-Wallet")
        escrow = escrow_address.lower()
        now = self.clock()
        reason = ((body.reason if body else "") or "").strip()[:500]
        req_hash = _request_hash({"reason": reason})
        idem_scope = f"POST:/requests/{request_id}/cancel:{chain_id}:{escrow}:{actor}"

        with self.db.read_conn() as rconn:
            if idempotency_key:
                cached = self._check_idempotency_locked(rconn, idem_scope, idempotency_key, req_hash)
                if cached is not None:
                    return cached

            pre_req = rconn.execute(
                "SELECT * FROM purchase_requests WHERE id = ? AND chain_id = ? AND escrow_address = ?",
                (request_id, chain_id, escrow),
            ).fetchone()
            if not pre_req:
                raise MarketplaceError(404, "REQUEST_NOT_FOUND", "Không tìm thấy yêu cầu mua hàng.")
            if actor not in (pre_req["buyer_wallet"], pre_req["seller_wallet"]):
                raise MarketplaceError(403, "FORBIDDEN", "Bạn không có quyền hủy yêu cầu này.")

            has_trade = rconn.execute(
                "SELECT id FROM listing_trades WHERE request_id = ?",
                (request_id,),
            ).fetchone()
            if has_trade or pre_req["status"] in ("ESCROW_CREATED", "COMPLETED", "TRADE_CANCELLED"):
                raise MarketplaceError(
                    409,
                    "ESCROW_ALREADY_CREATED",
                    "Yêu cầu đã liên kết Escrow on-chain, vui lòng hủy/giải ngân qua hợp đồng.",
                )

            bound_rows = rconn.execute(
                "SELECT trade_id FROM listing_trades WHERE chain_id = ? AND escrow_address = ?",
                (chain_id, escrow),
            ).fetchall()
            bound_tids = {int(r[0]) for r in bound_rows}

        if pre_req["status"] == "ACCEPTED":
            expires_at = pre_req["reservation_expires_at"]
            if actor == pre_req["buyer_wallet"] and expires_at is not None and now < int(expires_at):
                raise MarketplaceError(
                    409,
                    "RESERVATION_STILL_ACTIVE",
                    "Chỗ giữ đang trong thời hạn hiệu lực cho người bán tạo Escrow.",
                    {"reservation_expires_at": int(expires_at)},
                )
            verify_chain = bool(getattr(self.settings, "verify_chain_before_ttl_release", True))
            if verify_chain:
                if (
                    client is None
                    or not hasattr(client, "chain_id")
                    or not hasattr(client, "next_trade_id")
                    or not hasattr(client, "get_trade")
                    or not hasattr(client, "escrow")
                    or not hasattr(client.escrow, "address")
                ):
                    raise MarketplaceError(
                        503,
                        "CHAIN_UNVERIFIED_CANNOT_RELEASE",
                        "Không thể kết nối blockchain để kiểm tra Escrow; từ chối hủy giữ chỗ thiếu an toàn.",
                    )
                try:
                    if int(client.chain_id()) != chain_id or client.escrow.address.lower() != escrow:
                        raise MarketplaceError(
                            502,
                            "CHAIN_UNVERIFIED_CANNOT_RELEASE",
                            "RPC không khớp mạng/Escrow đang cấu hình; không thể giải phóng giữ chỗ.",
                        )
                    next_id = int(client.next_trade_id())
                    has_trade_onchain = self._has_matching_unbound_onchain_trade(
                        pre_req, client, bound_tids, {}, next_id
                    )
                except MarketplaceError:
                    raise
                except Exception as exc:
                    log.warning("RPC error checking on-chain trade before cancel(%s): %s", request_id, exc)
                    raise MarketplaceError(
                        502,
                        "CHAIN_UNVERIFIED_CANNOT_RELEASE",
                        "Không thể xác minh trạng thái Escrow on-chain; từ chối hủy giữ chỗ thiếu an toàn.",
                    )
                if has_trade_onchain:
                    raise MarketplaceError(
                        409,
                        "ONCHAIN_TRADE_ALREADY_EXISTS",
                        "Giao dịch createTrade đã tồn tại trên blockchain cho yêu cầu này; hãy gọi bind-trade hoặc hủy trực tiếp trên hợp đồng.",
                    )

        with self.db.write_tx() as conn:
            if idempotency_key:
                cached = self._check_idempotency_locked(conn, idem_scope, idempotency_key, req_hash)
                if cached is not None:
                    return cached

            req_row = conn.execute(
                "SELECT * FROM purchase_requests WHERE id = ? AND chain_id = ? AND escrow_address = ?",
                (request_id, chain_id, escrow),
            ).fetchone()
            if not req_row:
                raise MarketplaceError(404, "REQUEST_NOT_FOUND", "Không tìm thấy yêu cầu mua hàng.")
            if actor not in (req_row["buyer_wallet"], req_row["seller_wallet"]):
                raise MarketplaceError(403, "FORBIDDEN", "Bạn không có quyền hủy yêu cầu này.")

            has_trade = conn.execute(
                "SELECT id FROM listing_trades WHERE request_id = ?",
                (request_id,),
            ).fetchone()
            if has_trade or req_row["status"] in ("ESCROW_CREATED", "COMPLETED", "TRADE_CANCELLED"):
                raise MarketplaceError(
                    409,
                    "ESCROW_ALREADY_CREATED",
                    "Yêu cầu đã liên kết Escrow on-chain, vui lòng hủy/giải ngân qua hợp đồng.",
                )

            status = req_row["status"]
            if status == "PENDING":
                conn.execute(
                    "UPDATE purchase_requests SET status = 'CANCELLED', updated_at = ? WHERE id = ?",
                    (now, request_id),
                )
            elif status == "ACCEPTED":
                expires_at = req_row["reservation_expires_at"]
                if actor == req_row["buyer_wallet"] and expires_at is not None and now < int(expires_at):
                    raise MarketplaceError(
                        409,
                        "RESERVATION_STILL_ACTIVE",
                        "Chỗ giữ đang trong thời hạn hiệu lực cho người bán tạo Escrow.",
                        {"reservation_expires_at": int(expires_at)},
                    )
                cur = conn.execute(
                    """
                    UPDATE purchase_requests
                    SET status = 'CANCELLED', seller_note = CASE WHEN ? != '' THEN ? ELSE seller_note END, updated_at = ?
                    WHERE id = ? AND status = 'ACCEPTED'
                      AND NOT EXISTS (SELECT 1 FROM listing_trades lt WHERE lt.request_id = ?)
                    """,
                    (reason, reason, now, request_id, request_id),
                )
                if cur.rowcount == 0:
                    raise MarketplaceError(409, "INVALID_REQUEST_STATE", "Không thể hủy yêu cầu lúc này.")
                qty = int(req_row["quantity"])
                conn.execute(
                    """
                    UPDATE listings
                    SET quantity_reserved = MAX(0, quantity_reserved - ?),
                        status = CASE
                            WHEN status = 'RESERVED' AND (quantity_total - MAX(0, quantity_reserved - ?) - quantity_sold) > 0
                            THEN 'ACTIVE'
                            ELSE status
                        END,
                        updated_at = ?
                    WHERE id = ?
                    """,
                    (qty, qty, now, req_row["listing_id"]),
                )
            else:
                raise MarketplaceError(409, "INVALID_REQUEST_STATE", f"Yêu cầu đang ở trạng thái {status}, không thể hủy.")

            updated = conn.execute("SELECT * FROM purchase_requests WHERE id = ?", (request_id,)).fetchone()
            out = self._request_from_row(conn, updated)
            self._save_idempotency_locked(conn, idem_scope, idempotency_key, req_hash, 200, out, now)
            return out

    # -- Bind Trade & Sync (Verify-on-Read, Read-Only Reconciliation) -------

    def _apply_trade_state_locked(
        self,
        conn: sqlite3.Connection,
        req_row: sqlite3.Row,
        trade: Trade,
        now: int,
    ) -> str:
        """
        Đồng bộ idempotent trạng thái Trade on-chain -> purchase_requests + listings + listing_trades.
        Trả về synced_state.name.
        """
        qty = int(req_row["quantity"])
        req_status = req_row["status"]
        req_id = req_row["id"]
        listing_id = req_row["listing_id"]

        if trade.state == TradeState.Resolved:
            if req_status in ("ACCEPTED", "ESCROW_CREATED"):
                cur = conn.execute(
                    """
                    UPDATE purchase_requests
                    SET status = 'COMPLETED', reservation_expires_at = NULL, updated_at = ?
                    WHERE id = ? AND status IN ('ACCEPTED', 'ESCROW_CREATED')
                    """,
                    (now, req_id),
                )
                if cur.rowcount == 1:
                    conn.execute(
                        """
                        UPDATE listings
                        SET quantity_reserved = MAX(0, quantity_reserved - ?),
                            quantity_sold = quantity_sold + ?,
                            status = CASE
                                WHEN (quantity_sold + ?) >= quantity_total THEN 'SOLD'
                                WHEN status = 'RESERVED' AND (quantity_total - MAX(0, quantity_reserved - ?) - (quantity_sold + ?)) > 0 THEN 'ACTIVE'
                                ELSE status
                            END,
                            updated_at = ?
                        WHERE id = ?
                        """,
                        (qty, qty, qty, qty, qty, now, listing_id),
                    )
        elif trade.state == TradeState.Cancelled:
            if req_status in ("ACCEPTED", "ESCROW_CREATED"):
                cur = conn.execute(
                    """
                    UPDATE purchase_requests
                    SET status = 'TRADE_CANCELLED', reservation_expires_at = NULL, updated_at = ?
                    WHERE id = ? AND status IN ('ACCEPTED', 'ESCROW_CREATED')
                    """,
                    (now, req_id),
                )
                if cur.rowcount == 1:
                    conn.execute(
                        """
                        UPDATE listings
                        SET quantity_reserved = MAX(0, quantity_reserved - ?),
                            status = CASE
                                WHEN status = 'RESERVED' AND (quantity_total - MAX(0, quantity_reserved - ?) - quantity_sold) > 0 THEN 'ACTIVE'
                                ELSE status
                            END,
                            updated_at = ?
                        WHERE id = ?
                        """,
                        (qty, qty, now, listing_id),
                    )
        else:
            if req_status == "ACCEPTED":
                conn.execute(
                    """
                    UPDATE purchase_requests
                    SET status = 'ESCROW_CREATED', reservation_expires_at = NULL, updated_at = ?
                    WHERE id = ? AND status = 'ACCEPTED'
                    """,
                    (now, req_id),
                )

        conn.execute(
            """
            UPDATE listing_trades
            SET synced_state = ?, flagged = ?, last_synced_at = ?
            WHERE request_id = ?
            """,
            (trade.state.name, 1 if trade.flagged else 0, now, req_id),
        )
        return trade.state.name

    def bind_trade(
        self,
        actor_wallet: str,
        chain_id: int,
        escrow_address: str,
        request_id: str,
        body: BindTradeRequest,
        client: EscrowClient,
        idempotency_key: Optional[str] = None,
    ) -> dict[str, Any]:
        actor = normalize_wallet(actor_wallet, "X-Authenticated-Wallet")
        escrow = escrow_address.lower()
        tx_hash = body.tx_hash.strip().lower()
        if not _TX_HASH_RE.match(tx_hash):
            raise MarketplaceError(422, "INVALID_TX_HASH", "tx_hash phải là chuỗi hex 32 byte (0x + 64 ký tự).")

        if int(client.chain_id()) != chain_id:
            raise MarketplaceError(409, "CHAIN_MISMATCH", "Chain ID của RPC không khớp với yêu cầu.")
        if client.escrow.address.lower() != escrow:
            raise MarketplaceError(409, "ESCROW_MISMATCH", "Địa chỉ hợp đồng Escrow không khớp với yêu cầu.")

        # 1. Pre-check request, Idempotency-Key & fast idempotent recovery
        req_hash = _request_hash({"tx_hash": tx_hash, "trade_id": body.trade_id})
        idem_scope = f"POST:/requests/{request_id}/bind-trade:{chain_id}:{escrow}:{actor}"
        with self.db.read_conn() as conn:
            if idempotency_key:
                cached = self._check_idempotency_locked(conn, idem_scope, idempotency_key, req_hash)
                if cached is not None:
                    return cached

            req_row = conn.execute(
                "SELECT * FROM purchase_requests WHERE id = ? AND chain_id = ? AND escrow_address = ?",
                (request_id, chain_id, escrow),
            ).fetchone()
            if not req_row:
                raise MarketplaceError(404, "REQUEST_NOT_FOUND", "Không tìm thấy yêu cầu mua hàng.")
            if req_row["seller_wallet"] != actor:
                raise MarketplaceError(403, "FORBIDDEN", "Chỉ người bán tạo Escrow mới được phép liên kết giao dịch.")

            existing_by_req = conn.execute(
                "SELECT * FROM listing_trades WHERE request_id = ?",
                (request_id,),
            ).fetchone()
            if existing_by_req:
                same_tx = existing_by_req["tx_hash"].lower() == tx_hash
                same_tid = body.trade_id is None or int(existing_by_req["trade_id"]) == body.trade_id
                if same_tx and same_tid:
                    out = self._request_from_row(conn, req_row)
                    out["recovered"] = True
                    return out
                raise MarketplaceError(409, "REQUEST_ALREADY_BOUND", "Yêu cầu này đã được liên kết với một giao dịch Escrow khác.")

            existing_tx = conn.execute(
                "SELECT request_id FROM listing_trades WHERE chain_id = ? AND escrow_address = ? AND tx_hash = ?",
                (chain_id, escrow, tx_hash),
            ).fetchone()
            if existing_tx:
                raise MarketplaceError(409, "TX_ALREADY_BOUND", "Giao dịch tx_hash này đã được liên kết với yêu cầu khác.")

            if body.trade_id is not None:
                existing_tid = conn.execute(
                    "SELECT request_id FROM listing_trades WHERE chain_id = ? AND escrow_address = ? AND trade_id = ?",
                    (chain_id, escrow, body.trade_id),
                ).fetchone()
                if existing_tid:
                    raise MarketplaceError(409, "TRADE_ALREADY_BOUND", f"Trade #{body.trade_id} đã được liên kết với yêu cầu khác.")

            if req_row["status"] not in ("ACCEPTED", "EXPIRED"):
                raise MarketplaceError(
                    409,
                    "INVALID_REQUEST_STATE",
                    f"Yêu cầu phải ở trạng thái ACCEPTED (hoặc EXPIRED để khôi phục), hiện là {req_row['status']}.",
                )

        # 2. Verify on-chain (receipt + TradeCreated event + getTrade)
        try:
            verified = client.verify_create_trade_tx(tx_hash, expected_trade_id=body.trade_id)
        except ChainTxNotFound:
            raise MarketplaceError(404, "TX_NOT_FOUND", "Không tìm thấy receipt giao dịch trên blockchain.")
        except ChainValidationError as e:
            raise MarketplaceError(422, e.error_code, str(e))
        except ChainError as e:
            log.error("RPC error verifying tx %s: %s", tx_hash, e)
            raise MarketplaceError(502, "CHAIN_RPC_ERROR", "Lỗi kết nối RPC blockchain khi xác minh giao dịch.")

        if verified.chain_id != chain_id:
            raise MarketplaceError(422, "CHAIN_MISMATCH", "Giao dịch không nằm trên đúng mạng blockchain cấu hình.")
        if verified.escrow_address != escrow:
            raise MarketplaceError(422, "ESCROW_MISMATCH", "Giao dịch không thuộc hợp đồng Escrow của sàn.")
        if verified.seller != req_row["seller_wallet"]:
            raise MarketplaceError(422, "SELLER_MISMATCH", "Ví seller trên hợp đồng không khớp với tin đăng.")
        if verified.buyer != req_row["buyer_wallet"]:
            raise MarketplaceError(422, "BUYER_MISMATCH", "Ví buyer trên hợp đồng không khớp với người gửi yêu cầu.")
        if verified.item_value != int(req_row["total_value_wei"]):
            raise MarketplaceError(422, "ITEM_VALUE_MISMATCH", "Giá trị itemValue trên Escrow không khớp tổng giá trị yêu cầu.")

        # 3. Atomic commit in DB (hỗ trợ recovery nếu TTL vừa hết khi bind API từng rớt)
        now = self.clock()
        recovered = False

        with self.db.write_tx() as conn:
            if idempotency_key:
                cached = self._check_idempotency_locked(conn, idem_scope, idempotency_key, req_hash)
                if cached is not None:
                    return cached

            req_row = conn.execute(
                "SELECT * FROM purchase_requests WHERE id = ? AND chain_id = ? AND escrow_address = ?",
                (request_id, chain_id, escrow),
            ).fetchone()
            if not req_row:
                raise MarketplaceError(404, "REQUEST_NOT_FOUND", "Không tìm thấy yêu cầu mua hàng.")

            existing_by_req = conn.execute(
                "SELECT * FROM listing_trades WHERE request_id = ?",
                (request_id,),
            ).fetchone()
            if existing_by_req:
                if existing_by_req["tx_hash"].lower() == verified.tx_hash and int(existing_by_req["trade_id"]) == verified.trade_id:
                    out = self._request_from_row(conn, req_row)
                    out["recovered"] = True
                    return out
                raise MarketplaceError(409, "REQUEST_ALREADY_BOUND", "Yêu cầu này đã được liên kết với giao dịch khác.")

            if req_row["status"] == "EXPIRED":
                recovered = True
                qty = int(req_row["quantity"])
                if verified.trade.state in (TradeState.Cancelled, TradeState.Resolved):
                    if verified.trade.state == TradeState.Resolved:
                        cur = conn.execute(
                            """
                            UPDATE listings
                            SET quantity_sold = quantity_sold + ?,
                                status = CASE WHEN (quantity_sold + ?) >= quantity_total THEN 'SOLD' ELSE status END,
                                updated_at = ?
                            WHERE id = ?
                              AND status IN ('ACTIVE', 'RESERVED', 'PAUSED')
                              AND (quantity_total - quantity_reserved - quantity_sold) >= ?
                            """,
                            (qty, qty, now, req_row["listing_id"], qty),
                        )
                        if cur.rowcount == 0:
                            raise MarketplaceError(
                                409,
                                "INSUFFICIENT_STOCK_AFTER_EXPIRY",
                                "Không thể khôi phục vì tồn kho sản phẩm đã được bán/giữ chỗ cho giao dịch khác.",
                            )
                        target_status = "COMPLETED"
                    else:
                        target_status = "TRADE_CANCELLED"
                    conn.execute(
                        "UPDATE purchase_requests SET status = ?, reservation_expires_at = NULL, updated_at = ? WHERE id = ?",
                        (target_status, now, request_id),
                    )
                else:
                    cur = conn.execute(
                        """
                        UPDATE listings
                        SET quantity_reserved = quantity_reserved + ?,
                            status = CASE
                                WHEN (quantity_total - (quantity_reserved + ?) - quantity_sold) = 0 THEN 'RESERVED'
                                ELSE status
                            END,
                            updated_at = ?
                        WHERE id = ?
                          AND status IN ('ACTIVE', 'RESERVED', 'PAUSED')
                          AND (quantity_total - quantity_reserved - quantity_sold) >= ?
                        """,
                        (qty, qty, now, req_row["listing_id"], qty),
                    )
                    if cur.rowcount == 0:
                        raise MarketplaceError(
                            409,
                            "INSUFFICIENT_STOCK_AFTER_EXPIRY",
                            "Yêu cầu đã hết hạn và tồn kho không còn đủ để khôi phục liên kết.",
                        )
                    conn.execute(
                        "UPDATE purchase_requests SET status = 'ACCEPTED', updated_at = ? WHERE id = ?",
                        (now, request_id),
                    )
            elif req_row["status"] != "ACCEPTED":
                raise MarketplaceError(409, "INVALID_REQUEST_STATE", f"Yêu cầu đang ở trạng thái {req_row['status']}.")

            try:
                conn.execute(
                    """
                    INSERT INTO listing_trades (
                        chain_id, escrow_address, trade_id, listing_id, request_id,
                        tx_hash, synced_state, flagged, last_synced_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        chain_id, escrow, verified.trade_id, req_row["listing_id"], request_id,
                        verified.tx_hash, verified.trade.state.name, 1 if verified.trade.flagged else 0, now,
                    ),
                )
            except sqlite3.IntegrityError:
                raise MarketplaceError(409, "TRADE_ALREADY_BOUND", "Trade ID hoặc tx_hash này đã được liên kết trước đó.")

            req_row = conn.execute("SELECT * FROM purchase_requests WHERE id = ?", (request_id,)).fetchone()
            self._apply_trade_state_locked(conn, req_row, verified.trade, now)
            req_row = conn.execute("SELECT * FROM purchase_requests WHERE id = ?", (request_id,)).fetchone()
            out = self._request_from_row(conn, req_row)
            out["recovered"] = recovered
            self._save_idempotency_locked(conn, idem_scope, idempotency_key, req_hash, 200, out, now)
            return out

    def sync_trade(
        self,
        actor_wallet: str,
        chain_id: int,
        escrow_address: str,
        trade_id: int,
        client: EscrowClient,
    ) -> dict[str, Any]:
        """Đồng bộ chủ động trạng thái 1 trade từ blockchain (chỉ đọc .call())."""
        actor = normalize_wallet(actor_wallet, "X-Authenticated-Wallet")
        escrow = escrow_address.lower()
        if int(client.chain_id()) != chain_id:
            raise MarketplaceError(409, "CHAIN_MISMATCH", "Chain ID của RPC không khớp.")
        if client.escrow.address.lower() != escrow:
            raise MarketplaceError(409, "ESCROW_MISMATCH", "Địa chỉ Escrow không khớp.")

        try:
            trade = client.get_trade(trade_id)
        except ChainError as e:
            log.error("RPC error in sync_trade(%s): %s", trade_id, e)
            raise MarketplaceError(502, "CHAIN_RPC_ERROR", "Lỗi đọc trạng thái giao dịch từ blockchain.")

        if not trade.exists:
            raise MarketplaceError(404, "TRADE_NOT_FOUND", f"Không tìm thấy Trade #{trade_id} trên hợp đồng.")
        if actor not in (trade.seller.lower(), trade.buyer.lower()):
            raise MarketplaceError(403, "FORBIDDEN", "Chỉ seller hoặc buyer của giao dịch mới có quyền đồng bộ.")

        self.expire_stale_reservations(chain_id, escrow, client=client)
        now = self.clock()
        with self.db.write_tx() as conn:
            lt = conn.execute(
                "SELECT * FROM listing_trades WHERE chain_id = ? AND escrow_address = ? AND trade_id = ?",
                (chain_id, escrow, trade_id),
            ).fetchone()
            if not lt:
                return {
                    "trade_id": trade_id,
                    "bound": False,
                    "synced_state": trade.state.name,
                    "flagged": bool(trade.flagged),
                }

            req_row = conn.execute("SELECT * FROM purchase_requests WHERE id = ?", (lt["request_id"],)).fetchone()
            synced_state = self._apply_trade_state_locked(conn, req_row, trade, now)
            req_after = conn.execute("SELECT status FROM purchase_requests WHERE id = ?", (req_row["id"],)).fetchone()
            lst_after = conn.execute(
                "SELECT status, quantity_reserved, quantity_sold, quantity_total FROM listings WHERE id = ?",
                (lt["listing_id"],),
            ).fetchone()
            return {
                "trade_id": trade_id,
                "bound": True,
                "listing_id": lt["listing_id"],
                "request_id": lt["request_id"],
                "synced_state": synced_state,
                "flagged": bool(trade.flagged),
                "request_status": req_after["status"] if req_after else None,
                "listing_status": lst_after["status"] if lst_after else None,
                "quantity_reserved": int(lst_after["quantity_reserved"]) if lst_after else None,
                "quantity_sold": int(lst_after["quantity_sold"]) if lst_after else None,
                "last_synced_at": now,
            }

    def reconcile(
        self,
        client: Optional[EscrowClient] = None,
        chain_id: Optional[int] = None,
        escrow_address: Optional[str] = None,
    ) -> dict[str, Any]:
        """
        Reconciliation chỉ đọc (TTL expiry + đối soát trade đang mở từ blockchain).
        Hoàn toàn tách khỏi AI verify/attest và KHÔNG gửi bất kỳ giao dịch nào.
        """
        now = self.clock()
        eff_chain = chain_id
        eff_escrow = escrow_address.lower() if escrow_address else None
        if client is not None:
            eff_chain = int(client.chain_id())
            if hasattr(client, "escrow") and hasattr(client.escrow, "address"):
                eff_escrow = client.escrow.address.lower()

        released = self.expire_stale_reservations(eff_chain, eff_escrow, client=client)
        synced = 0
        errors = 0

        if client is not None and eff_chain is not None and eff_escrow is not None:
            with self.db.read_conn() as conn:
                open_rows = conn.execute(
                    """
                    SELECT lt.trade_id, lt.request_id
                    FROM listing_trades lt
                    JOIN purchase_requests pr ON pr.id = lt.request_id
                    WHERE lt.chain_id = ?
                      AND lt.escrow_address = ?
                      AND (lt.synced_state NOT IN ('Resolved', 'Cancelled') OR pr.status = 'ESCROW_CREATED')
                    """,
                    (eff_chain, eff_escrow),
                ).fetchall()

            for row in open_rows:
                tid = int(row["trade_id"])
                try:
                    trade = client.get_trade(tid)
                except ChainError as e:
                    errors += 1
                    log.warning("reconcile get_trade(%s) lỗi RPC: %s", tid, e)
                    continue
                if not trade.exists:
                    continue
                with self.db.write_tx() as wconn:
                    req_row = wconn.execute("SELECT * FROM purchase_requests WHERE id = ?", (row["request_id"],)).fetchone()
                    if req_row:
                        self._apply_trade_state_locked(wconn, req_row, trade, now)
                        synced += 1

        return {"expired_released": released, "trades_synced": synced, "rpc_errors": errors}

    def get_trade_context(
        self,
        chain_id: int,
        escrow_address: str,
        trade_id: int,
    ) -> dict[str, Any]:
        escrow = escrow_address.lower()
        with self.db.read_conn() as conn:
            lt = conn.execute(
                "SELECT * FROM listing_trades WHERE chain_id = ? AND escrow_address = ? AND trade_id = ?",
                (chain_id, escrow, trade_id),
            ).fetchone()
            if not lt:
                return {"trade_id": trade_id, "bound": False}

            listing_row = conn.execute("SELECT * FROM listings WHERE id = ?", (lt["listing_id"],)).fetchone()
            req_row = conn.execute("SELECT * FROM purchase_requests WHERE id = ?", (lt["request_id"],)).fetchone()
            listing_data = self._listing_from_row(conn, listing_row) if listing_row else None
            return {
                "trade_id": trade_id,
                "bound": True,
                "listing_id": lt["listing_id"],
                "request_id": lt["request_id"],
                "tx_hash": lt["tx_hash"],
                "synced_state": lt["synced_state"],
                "flagged": bool(lt["flagged"]),
                "last_synced_at": int(lt["last_synced_at"]),
                "request_status": req_row["status"] if req_row else None,
                "quantity": int(req_row["quantity"]) if req_row else None,
                "unit_price_wei": req_row["unit_price_wei"] if req_row else None,
                "total_value_wei": req_row["total_value_wei"] if req_row else None,
                "deposit_required_wei": deposit_for_wei(req_row["total_value_wei"]) if req_row else None,
                "collateral_asset": "AVAX",
                "accounting_token": "CDU",
                "listing": listing_data,
            }
