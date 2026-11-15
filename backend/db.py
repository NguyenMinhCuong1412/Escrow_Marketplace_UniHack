"""
db.py
-----
SQLite (WAL mode) persistence layer for Escrow Marketplace (`DATA_DIR/marketplace.db`).
Dùng stdlib sqlite3 với kết nối ngắn hạn theo transaction (mở/đóng tường minh để
an toàn trên Windows và nhiều thread), `BEGIN IMMEDIATE` chống race-condition / oversell.
"""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS listings (
    id TEXT PRIMARY KEY,
    chain_id INTEGER NOT NULL,
    escrow_address TEXT NOT NULL,
    seller_wallet TEXT NOT NULL,
    sku TEXT NOT NULL,
    sku_norm TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('LEGO', 'MODEL_KIT', 'FIGURE', 'TRADING_CARD', 'COIN', 'OTHER')),
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    price_wei TEXT NOT NULL,
    condition TEXT NOT NULL CHECK (condition IN ('SEALED_NEW', 'LIKE_NEW', 'USED_GOOD', 'USED_FAIR', 'GRADED')),
    quantity_total INTEGER NOT NULL CHECK (quantity_total >= 1),
    quantity_reserved INTEGER NOT NULL DEFAULT 0 CHECK (quantity_reserved >= 0),
    quantity_sold INTEGER NOT NULL DEFAULT 0 CHECK (quantity_sold >= 0),
    primary_image_uri TEXT NOT NULL,
    primary_image_sha256 TEXT NOT NULL DEFAULT '',
    primary_image_phash TEXT NOT NULL DEFAULT '',
    image_review_required INTEGER NOT NULL DEFAULT 0 CHECK (image_review_required IN (0, 1)),
    image_warnings_json TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'RESERVED', 'SOLD', 'PAUSED', 'CANCELLED')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    CHECK (quantity_reserved + quantity_sold <= quantity_total)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_seller_sku
ON listings (chain_id, escrow_address, seller_wallet, sku_norm)
WHERE status IN ('ACTIVE', 'RESERVED', 'PAUSED');

CREATE INDEX IF NOT EXISTS idx_listings_browse
ON listings (chain_id, escrow_address, status, category, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_listings_seller
ON listings (chain_id, escrow_address, seller_wallet, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_listings_sha256
ON listings (chain_id, escrow_address, primary_image_sha256);

CREATE TABLE IF NOT EXISTS listing_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    cid TEXT NOT NULL,
    uri TEXT NOT NULL,
    sha256 TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_listing_one_primary
ON listing_images (listing_id)
WHERE is_primary = 1;

CREATE INDEX IF NOT EXISTS idx_listing_images_listing
ON listing_images (listing_id, sort_order ASC, id ASC);

CREATE TABLE IF NOT EXISTS purchase_requests (
    id TEXT PRIMARY KEY,
    listing_id TEXT NOT NULL REFERENCES listings(id),
    chain_id INTEGER NOT NULL,
    escrow_address TEXT NOT NULL,
    seller_wallet TEXT NOT NULL,
    buyer_wallet TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity >= 1),
    unit_price_wei TEXT NOT NULL,
    total_value_wei TEXT NOT NULL,
    buyer_note TEXT NOT NULL DEFAULT '',
    seller_note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL CHECK (status IN (
        'PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED',
        'EXPIRED', 'ESCROW_CREATED', 'COMPLETED', 'TRADE_CANCELLED'
    )),
    reservation_expires_at INTEGER,
    min_onchain_trade_id INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_requests_listing
ON purchase_requests (listing_id, status);

CREATE INDEX IF NOT EXISTS idx_requests_buyer
ON purchase_requests (chain_id, escrow_address, buyer_wallet, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_requests_seller
ON purchase_requests (chain_id, escrow_address, seller_wallet, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_requests_expiry
ON purchase_requests (status, reservation_expires_at)
WHERE status = 'ACCEPTED';

CREATE TABLE IF NOT EXISTS listing_trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chain_id INTEGER NOT NULL,
    escrow_address TEXT NOT NULL,
    trade_id INTEGER NOT NULL,
    listing_id TEXT NOT NULL REFERENCES listings(id),
    request_id TEXT NOT NULL UNIQUE REFERENCES purchase_requests(id),
    tx_hash TEXT NOT NULL,
    synced_state TEXT NOT NULL,
    flagged INTEGER NOT NULL DEFAULT 0,
    last_synced_at INTEGER NOT NULL,
    UNIQUE (chain_id, escrow_address, trade_id),
    UNIQUE (chain_id, escrow_address, tx_hash)
);

CREATE INDEX IF NOT EXISTS idx_listing_trades_open
ON listing_trades (chain_id, escrow_address, synced_state);

CREATE TABLE IF NOT EXISTS used_proxy_nonces (
    nonce TEXT PRIMARY KEY,
    actor_wallet TEXT NOT NULL,
    expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_proxy_nonces_expires
ON used_proxy_nonces (expires_at);

CREATE TABLE IF NOT EXISTS idempotency_records (
    scope TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    status_code INTEGER NOT NULL,
    response_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (scope, idempotency_key)
);
"""


class MarketplaceDB:
    """Quản lý kết nối SQLite WAL và giao dịch nguyên tử cho Marketplace."""

    def __init__(self, db_path: Path):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(
            str(self.db_path),
            timeout=10.0,
            isolation_level=None,
            check_same_thread=False,
        )
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA busy_timeout=5000;")
        conn.execute("PRAGMA foreign_keys=ON;")
        return conn

    def _init_schema(self) -> None:
        conn = self._connect()
        try:
            conn.execute("PRAGMA journal_mode=WAL;")
            conn.execute("PRAGMA synchronous=NORMAL;")
            conn.executescript(SCHEMA_SQL)
            cols = {
                row[1]
                for row in conn.execute("PRAGMA table_info(purchase_requests);").fetchall()
            }
            if "min_onchain_trade_id" not in cols:
                conn.execute("ALTER TABLE purchase_requests ADD COLUMN min_onchain_trade_id INTEGER;")
        finally:
            conn.close()

    @contextmanager
    def read_conn(self) -> Iterator[sqlite3.Connection]:
        conn = self._connect()
        try:
            yield conn
        finally:
            conn.close()

    @contextmanager
    def write_tx(self) -> Iterator[sqlite3.Connection]:
        conn = self._connect()
        in_tx = False
        try:
            conn.execute("BEGIN IMMEDIATE")
            in_tx = True
            yield conn
            conn.execute("COMMIT")
            in_tx = False
        except Exception:
            if in_tx:
                try:
                    conn.execute("ROLLBACK")
                except sqlite3.Error:
                    pass
            raise
        finally:
            conn.close()

    def record_proxy_nonce(self, nonce: str, actor_wallet: str, expires_at: int, now: int) -> bool:
        """Ghi nhận nonce một lần từ BFF proxy. Trả False nếu nonce đã dùng (replay)."""
        with self.write_tx() as conn:
            conn.execute("DELETE FROM used_proxy_nonces WHERE expires_at <= ?", (now,))
            try:
                conn.execute(
                    "INSERT INTO used_proxy_nonces (nonce, actor_wallet, expires_at) VALUES (?, ?, ?)",
                    (nonce, actor_wallet.lower(), expires_at),
                )
                return True
            except sqlite3.IntegrityError:
                return False
